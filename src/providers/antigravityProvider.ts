/**
 * Antigravity Provider — v3.
 *
 * Routes AI requests through Google Antigravity, using its built-in
 * Claude subscription instead of a personal Anthropic API key.
 *
 * Strategy:
 *   Antigravity exposes Claude via its internal MCP tools. This provider
 *   invokes the `antigravity` CLI (if installed at `~/.gemini/antigravity/`)
 *   with a non-interactive prompt, capturing the response.
 *
 *   If the Antigravity CLI is not found, it falls back to the Claude provider
 *   with a clear warning.
 *
 * Detect Antigravity availability:
 *   - Checks for `antigravity` or `gemini` binary in PATH
 *   - Checks for ~/.gemini/antigravity/mcp_config.json (registration marker)
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import type { ClaudeResponse, ChatMessage, HealthCheckResult, ModelInfo, RequestOptions, StreamRequestOptions } from '../types.js';
import type { AIProvider, ImageSource, ChatOptions } from './aiProvider.js';
import { ClaudeProvider } from './claudeProvider.js';
import { recordEvent, buildEvent } from '../analytics/collector.js';
import * as logger from '../utils/logger.js';

// ── Detection ─────────────────────────────────────────────────────

const ANTIGRAVITY_CONFIG = resolve(homedir(), '.gemini', 'antigravity', 'mcp_config.json');

/** Returns the Antigravity/Gemini CLI binary name if found, or null */
function detectAntigravityBinary(): string | null {
  const candidates = ['antigravity', 'gemini', 'ag'];
  for (const bin of candidates) {
    try {
      execSync(`which ${bin}`, { stdio: 'pipe' });
      return bin;
    } catch {
      // not found, try next
    }
  }
  return null;
}

export function isAntigravityAvailable(): boolean {
  return existsSync(ANTIGRAVITY_CONFIG) || detectAntigravityBinary() !== null;
}

// ── Antigravity Provider ──────────────────────────────────────────

export class AntigravityProvider implements AIProvider {
  readonly name = 'Antigravity';
  private fallback = new ClaudeProvider();
  private binary: string | null;

  constructor() {
    this.binary = detectAntigravityBinary();
  }

  /**
   * Invoke Antigravity CLI with a prompt.
   * Returns the text response or throws if unavailable.
   */
  private invokeAntigravity(prompt: string, system?: string): { content: string; durationMs: number } {
    if (!this.binary) {
      throw new Error(
        'Antigravity binary not found. Install Antigravity and ensure it is in your PATH.\n' +
        'Download: https://developers.google.com/gemini/antigravity\n' +
        'Or switch back: npm run use:claude'
      );
    }

    const start = Date.now();

    // Build args — Antigravity CLI accepts -p for prompt, -s for system
    const args = ['-p', prompt];
    if (system) args.push('-s', system);

    const result = spawnSync(this.binary, args, {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.error) {
      throw new Error(`Antigravity error: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || 'Unknown error';
      throw new Error(`Antigravity exited with code ${result.status}: ${stderr}`);
    }

    return {
      content: (result.stdout || '').trim(),
      durationMs: Date.now() - start,
    };
  }

  private buildFallbackResponse(content: string, durationMs: number): ClaudeResponse {
    return {
      content,
      model: 'antigravity-subscription',
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end_turn',
    };
  }

  async ask(options: RequestOptions): Promise<ClaudeResponse> {
    if (!this.binary) {
      logger.warn('Antigravity binary not found — falling back to Claude API');
      return this.fallback.ask(options);
    }

    const { content, durationMs } = this.invokeAntigravity(options.prompt, options.system);
    const response = this.buildFallbackResponse(content, durationMs);

    recordEvent(buildEvent({
      backend: 'antigravity', model: 'antigravity-subscription',
      inputTokens: 0, outputTokens: 0, costUsd: 0,
      durationMs, tool: 'ask',
    }));

    return response;
  }

  async askStream(options: StreamRequestOptions): Promise<ClaudeResponse> {
    // Antigravity CLI doesn't support true streaming — simulate with full response
    const response = await this.ask(options);
    // Emit content as a single chunk
    options.onChunk(response.content);
    options.onComplete?.(response);
    return response;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ClaudeResponse> {
    if (!this.binary) {
      logger.warn('Antigravity binary not found — falling back to Claude API');
      return this.fallback.chat(messages, options);
    }

    // Flatten conversation history into a prompt block
    const conversationText = messages
      .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    const { content, durationMs } = this.invokeAntigravity(conversationText, options?.system);
    const response = this.buildFallbackResponse(content, durationMs);

    recordEvent(buildEvent({
      backend: 'antigravity', model: 'antigravity-subscription',
      inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs, tool: 'chat',
    }));

    return response;
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void, options?: ChatOptions): Promise<ClaudeResponse> {
    const response = await this.chat(messages, options);
    onChunk(response.content);
    return response;
  }

  async askWithImage(src: ImageSource, prompt: string, options?: Omit<RequestOptions, 'prompt'>): Promise<ClaudeResponse> {
    if (!this.binary) {
      logger.warn('Antigravity binary not found — falling back to Claude API for vision');
      return this.fallback.askWithImage(src, prompt, options);
    }

    // Pass image path/url as part of prompt (Antigravity CLI supports file paths)
    const imageRef = src.type === 'url' ? src.value : src.value;
    const fullPrompt = `[Image: ${imageRef}]\n\n${prompt}`;

    const { content, durationMs } = this.invokeAntigravity(fullPrompt, options?.system);
    const response = this.buildFallbackResponse(content, durationMs);

    recordEvent(buildEvent({ backend: 'antigravity', model: 'antigravity-subscription', inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs, tool: 'vision' }));

    return response;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const available = isAntigravityAvailable();
    const binary = this.binary;

    return {
      status: available ? 'ok' : 'error',
      model: 'antigravity-subscription',
      apiKeyConfigured: true, // No API key needed
      apiReachable: available,
      latencyMs: 0,
      error: available ? undefined : 'Antigravity CLI not found. Run: npm run use:claude to switch back.',
    };
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      {
        id: 'antigravity-subscription',
        displayName: 'Antigravity (subscription)',
        createdAt: new Date().toISOString(),
      },
    ];
  }
}
