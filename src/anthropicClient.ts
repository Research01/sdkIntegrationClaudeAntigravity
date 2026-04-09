import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import type { AppConfig, ClaudeResponse, ChatMessage, HealthCheckResult, ModelInfo, RequestOptions, StreamRequestOptions } from './types.js';
import * as logger from './utils/logger.js';
import { safeExecute } from './utils/errors.js';

/**
 * Singleton-like Anthropic client factory.
 * Creates a well-configured client that can be reused across CLI and MCP.
 */
let cachedClient: Anthropic | null = null;
let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}

export function getClient(): Anthropic {
  if (!cachedClient) {
    const cfg = getConfig();
    cachedClient = new Anthropic({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseUrl,
      timeout: cfg.timeoutMs,
    });
    logger.debug('Anthropic client initialized');
  }
  return cachedClient;
}

/** Reset the cached client (useful for testing or config changes) */
export function resetClient(): void {
  cachedClient = null;
  cachedConfig = null;
}

/**
 * Send a single prompt to Claude and get a response.
 */
export async function ask(options: RequestOptions): Promise<ClaudeResponse> {
  const cfg = getConfig();
  const client = getClient();

  const model = options.model || cfg.model;
  const maxTokens = options.maxTokens || cfg.maxTokens;
  const temperature = options.temperature ?? cfg.temperature;

  logger.debug(`Sending request to model=${model}, maxTokens=${maxTokens}, temperature=${temperature}`);

  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: options.prompt }],
  };

  if (options.system) {
    params.system = options.system;
  }

  const response = await client.messages.create(params);

  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  if (!textContent) {
    throw new Error('Claude returned an empty response. Try rephrasing your prompt.');
  }

  return {
    content: textContent,
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    stopReason: response.stop_reason,
  };
}

/**
 * Stream a single prompt to Claude, calling onChunk for each text delta.
 * Returns the final assembled ClaudeResponse after streaming completes.
 *
 * v2 — Streaming support.
 */
export async function askStream(options: StreamRequestOptions): Promise<ClaudeResponse> {
  const cfg = getConfig();
  const client = getClient();

  const model = options.model || cfg.model;
  const maxTokens = options.maxTokens || cfg.maxTokens;
  const temperature = options.temperature ?? cfg.temperature;

  logger.debug(`Streaming request to model=${model}, maxTokens=${maxTokens}`);

  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: options.prompt }],
    stream: true,
  };

  if (options.system) {
    params.system = options.system;
  }

  const stream = await client.messages.create(params as Anthropic.MessageCreateParamsStreaming);

  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finalModel = model;
  let stopReason: string | null = null;

  for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const chunk = event.delta.text;
      fullContent += chunk;
      options.onChunk(chunk);
    } else if (event.type === 'message_start') {
      finalModel = event.message.model;
      inputTokens = event.message.usage?.input_tokens ?? 0;
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens ?? 0;
      stopReason = event.delta.stop_reason ?? null;
    }
  }

  const response: ClaudeResponse = {
    content: fullContent,
    model: finalModel,
    usage: { inputTokens, outputTokens },
    stopReason,
  };

  if (options.onComplete) {
    options.onComplete(response);
  }

  return response;
}

/**
 * Send a multi-turn conversation to Claude.
 */
export async function chat(
  messages: ChatMessage[],
  options?: { system?: string; model?: string; maxTokens?: number; temperature?: number }
): Promise<ClaudeResponse> {
  const cfg = getConfig();
  const client = getClient();

  const model = options?.model || cfg.model;
  const maxTokens = options?.maxTokens || cfg.maxTokens;
  const temperature = options?.temperature ?? cfg.temperature;

  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  };

  if (options?.system) {
    params.system = options.system;
  }

  const response = await client.messages.create(params);

  const textContent = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return {
    content: textContent || '',
    model: response.model,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
    stopReason: response.stop_reason,
  };
}

/**
 * Stream a multi-turn conversation to Claude.
 *
 * v2 — Streaming support for multi-turn.
 */
export async function chatStream(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  options?: { system?: string; model?: string; maxTokens?: number; temperature?: number }
): Promise<ClaudeResponse> {
  const cfg = getConfig();
  const client = getClient();

  const model = options?.model || cfg.model;
  const maxTokens = options?.maxTokens || cfg.maxTokens;
  const temperature = options?.temperature ?? cfg.temperature;

  const params: Anthropic.MessageCreateParams = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  if (options?.system) {
    params.system = options.system;
  }

  const stream = await client.messages.create(params as Anthropic.MessageCreateParamsStreaming);

  let fullContent = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let finalModel = model;
  let stopReason: string | null = null;

  for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      const chunk = event.delta.text;
      fullContent += chunk;
      onChunk(chunk);
    } else if (event.type === 'message_start') {
      finalModel = event.message.model;
      inputTokens = event.message.usage?.input_tokens ?? 0;
    } else if (event.type === 'message_delta') {
      outputTokens = event.usage?.output_tokens ?? 0;
      stopReason = event.delta.stop_reason ?? null;
    }
  }

  return {
    content: fullContent,
    model: finalModel,
    usage: { inputTokens, outputTokens },
    stopReason,
  };
}

/**
 * Run a health check against the Anthropic API.
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const cfg = getConfig();
    const client = getClient();

    // Attempt a minimal request to verify connectivity
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with "ok".' }],
    });

    const latencyMs = Date.now() - start;

    return {
      status: 'ok',
      model: cfg.model,
      apiKeyConfigured: true,
      apiReachable: true,
      latencyMs,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    let apiKeyConfigured = true;
    try {
      getConfig();
    } catch {
      apiKeyConfigured = false;
    }

    return {
      status: 'error',
      model: cachedConfig?.model || 'unknown',
      apiKeyConfigured,
      apiReachable: false,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * List available models from the Anthropic API.
 */
export async function listModels(): Promise<ModelInfo[]> {
  const client = getClient();

  const response = await client.models.list({ limit: 100 });

  const models: ModelInfo[] = [];
  for (const model of response.data) {
    models.push({
      id: model.id,
      displayName: model.display_name,
      createdAt: model.created_at,
    });
  }

  // Sort by created_at descending (newest first)
  models.sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return models;
}
