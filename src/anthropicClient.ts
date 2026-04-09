import Anthropic from '@anthropic-ai/sdk';
import { loadConfig } from './config.js';
import type { AppConfig, ClaudeResponse, ChatMessage, HealthCheckResult, ModelInfo, RequestOptions } from './types.js';
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
