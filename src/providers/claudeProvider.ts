/**
 * Claude API Provider — v3.
 *
 * Implements AIProvider using the Anthropic SDK directly.
 * This is the "pay-as-you-go" backend that uses ANTHROPIC_API_KEY.
 *
 * Integrates:
 *   - Response cache (when CACHE_ENABLED=true)
 *   - Analytics event recording
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { loadConfig } from '../config.js';
import type {
  ClaudeResponse, ChatMessage, HealthCheckResult, ModelInfo, RequestOptions, StreamRequestOptions,
} from '../types.js';
import type { AIProvider, ImageSource, ChatOptions } from './aiProvider.js';
import * as logger from '../utils/logger.js';
import { buildCacheKey, getFromCache, setInCache } from '../utils/responseCache.js';
import { recordEvent, buildEvent } from '../analytics/collector.js';
import { calculateActualCost } from '../utils/costEstimator.js';

// ── Singleton client ──────────────────────────────────────────────

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    const cfg = loadConfig();
    _client = new Anthropic({ apiKey: cfg.apiKey, baseURL: cfg.baseUrl, timeout: cfg.timeoutMs });
  }
  return _client;
}

function getConfig() { return loadConfig(); }

// ── Media type detection ──────────────────────────────────────────

function detectMediaType(filePath: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const ext = filePath.toLowerCase().split('.').pop();
  switch (ext) {
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png':              return 'image/png';
    case 'gif':              return 'image/gif';
    case 'webp':             return 'image/webp';
    default:                 return 'image/jpeg';
  }
}

// ── Shared response builder ────────────────────────────────────────

function extractResponse(raw: Anthropic.Message): ClaudeResponse {
  const content = raw.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  return {
    content: content || '',
    model: raw.model,
    usage: { inputTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens },
    stopReason: raw.stop_reason,
  };
}

// ── ClaudeProvider ────────────────────────────────────────────────

export class ClaudeProvider implements AIProvider {
  readonly name = 'Claude API';

  async ask(options: RequestOptions): Promise<ClaudeResponse> {
    const cfg = getConfig();
    const model = options.model || cfg.model;
    const start = Date.now();

    // Cache lookup
    const key = buildCacheKey({ model, prompt: options.prompt, system: options.system, temperature: options.temperature ?? cfg.temperature });
    const cached = getFromCache(key);
    if (cached) {
      logger.debug('Cache hit');
      recordEvent(buildEvent({ backend: 'claude', model, inputTokens: cached.usage.inputTokens, outputTokens: cached.usage.outputTokens, costUsd: 0, durationMs: 0, cacheHit: true, tool: 'ask' }));
      return cached;
    }

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: options.maxTokens || cfg.maxTokens,
      temperature: options.temperature ?? cfg.temperature,
      messages: [{ role: 'user', content: options.prompt }],
    };
    if (options.system) params.system = options.system;

    const raw = await getClient().messages.create(params);
    const response = extractResponse(raw);
    const durationMs = Date.now() - start;
    const costUsd = calculateActualCost(model, response.usage.inputTokens, response.usage.outputTokens);

    setInCache(key, response, { model, prompt: options.prompt, system: options.system, temperature: options.temperature });
    recordEvent(buildEvent({ backend: 'claude', model, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, costUsd, durationMs, tool: 'ask' }));

    return response;
  }

  async askStream(options: StreamRequestOptions): Promise<ClaudeResponse> {
    const cfg = getConfig();
    const model = options.model || cfg.model;
    const start = Date.now();

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: options.maxTokens || cfg.maxTokens,
      temperature: options.temperature ?? cfg.temperature,
      messages: [{ role: 'user', content: options.prompt }],
      stream: true,
    };
    if (options.system) params.system = options.system;

    const stream = await getClient().messages.create(params as Anthropic.MessageCreateParamsStreaming);

    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finalModel = model;
    let stopReason: string | null = null;

    for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        options.onChunk(event.delta.text);
      } else if (event.type === 'message_start') {
        finalModel = event.message.model;
        inputTokens = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? 0;
        stopReason = event.delta.stop_reason ?? null;
      }
    }

    const response: ClaudeResponse = { content: fullContent, model: finalModel, usage: { inputTokens, outputTokens }, stopReason };
    const costUsd = calculateActualCost(finalModel, inputTokens, outputTokens);
    recordEvent(buildEvent({ backend: 'claude', model: finalModel, inputTokens, outputTokens, costUsd, durationMs: Date.now() - start, tool: 'ask_stream' }));

    options.onComplete?.(response);
    return response;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ClaudeResponse> {
    const cfg = getConfig();
    const model = options?.model || cfg.model;
    const start = Date.now();

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: options?.maxTokens || cfg.maxTokens,
      temperature: options?.temperature ?? cfg.temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (options?.system) params.system = options.system;

    const raw = await getClient().messages.create(params);
    const response = extractResponse(raw);
    const costUsd = calculateActualCost(model, response.usage.inputTokens, response.usage.outputTokens);
    recordEvent(buildEvent({ backend: 'claude', model, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, costUsd, durationMs: Date.now() - start, tool: 'chat' }));

    return response;
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<ClaudeResponse> {
    const cfg = getConfig();
    const model = options?.model || cfg.model;
    const start = Date.now();

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: options?.maxTokens || cfg.maxTokens,
      temperature: options?.temperature ?? cfg.temperature,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
    };
    if (options?.system) params.system = options.system;

    const stream = await getClient().messages.create(params as Anthropic.MessageCreateParamsStreaming);
    let fullContent = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finalModel = model;
    let stopReason: string | null = null;

    for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullContent += event.delta.text;
        onChunk(event.delta.text);
      } else if (event.type === 'message_start') {
        finalModel = event.message.model;
        inputTokens = event.message.usage?.input_tokens ?? 0;
      } else if (event.type === 'message_delta') {
        outputTokens = event.usage?.output_tokens ?? 0;
        stopReason = event.delta.stop_reason ?? null;
      }
    }

    const response: ClaudeResponse = { content: fullContent, model: finalModel, usage: { inputTokens, outputTokens }, stopReason };
    const costUsd = calculateActualCost(finalModel, inputTokens, outputTokens);
    recordEvent(buildEvent({ backend: 'claude', model: finalModel, inputTokens, outputTokens, costUsd, durationMs: Date.now() - start, tool: 'chat_stream' }));

    return response;
  }

  async askWithImage(src: ImageSource, prompt: string, options?: Omit<RequestOptions, 'prompt'>): Promise<ClaudeResponse> {
    const cfg = getConfig();
    const model = options?.model || cfg.model;
    const start = Date.now();

    let imageContent: Anthropic.ImageBlockParam;

    if (src.type === 'url') {
      imageContent = { type: 'image', source: { type: 'url', url: src.value } };
    } else {
      const data = readFileSync(src.value);
      const base64 = data.toString('base64');
      const mediaType = src.mediaType ?? detectMediaType(src.value);
      imageContent = { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };
    }

    const params: Anthropic.MessageCreateParams = {
      model,
      max_tokens: options?.maxTokens || cfg.maxTokens,
      temperature: options?.temperature ?? cfg.temperature,
      messages: [{ role: 'user', content: [imageContent, { type: 'text', text: prompt }] }],
    };
    if (options?.system) params.system = options.system;

    const raw = await getClient().messages.create(params);
    const response = extractResponse(raw);
    const costUsd = calculateActualCost(model, response.usage.inputTokens, response.usage.outputTokens);
    recordEvent(buildEvent({ backend: 'claude', model, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, costUsd, durationMs: Date.now() - start, tool: 'vision' }));

    return response;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const cfg = getConfig();
      await getClient().messages.create({
        model: cfg.model, max_tokens: 16,
        messages: [{ role: 'user', content: 'Reply with "ok".' }],
      });
      return { status: 'ok', model: cfg.model, apiKeyConfigured: true, apiReachable: true, latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'error', model: 'unknown', apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY, apiReachable: false, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    const res = await getClient().models.list({ limit: 100 });
    const models: ModelInfo[] = res.data.map((m) => ({ id: m.id, displayName: m.display_name, createdAt: m.created_at }));
    return models.sort((a, b) => (!a.createdAt || !b.createdAt) ? 0 : b.createdAt.localeCompare(a.createdAt));
  }
}
