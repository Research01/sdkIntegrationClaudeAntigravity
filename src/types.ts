// ── Core Types for Claude Integration ──────────────────────────────

/** Environment configuration shape */
export interface AppConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl: string;
  timeoutMs: number;
  temperature: number;
}

/** Options that can override config per-request */
export interface RequestOptions {
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Standardized response from Claude */
export interface ClaudeResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  stopReason: string | null;
}

/** Health check result */
export interface HealthCheckResult {
  status: 'ok' | 'error';
  model: string;
  apiKeyConfigured: boolean;
  apiReachable: boolean;
  latencyMs: number;
  error?: string;
}

/** Model info from API */
export interface ModelInfo {
  id: string;
  displayName: string;
  createdAt?: string;
}

/** Chat message for conversation history */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** MCP tool input schemas */
export interface ClaudeAskInput {
  prompt: string;
  system?: string;
  model?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ClaudeExplainInput {
  code_or_summary: string;
  language?: string;
  context?: string;
}
