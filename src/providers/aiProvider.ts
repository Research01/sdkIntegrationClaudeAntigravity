/**
 * AIProvider — Interface común para cualquier backend de IA.
 *
 * Implementaciones:
 *   ClaudeProvider       → Anthropic SDK directo (pay-as-you-go)
 *   AntigravityProvider  → Google Antigravity (suscripción mensual)
 */

import type {
  ClaudeResponse,
  ChatMessage,
  HealthCheckResult,
  ModelInfo,
  RequestOptions,
  StreamRequestOptions,
} from '../types.js';

export interface ChatOptions {
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;

  /** Single-turn prompt */
  ask(options: RequestOptions): Promise<ClaudeResponse>;

  /** Single-turn prompt with streaming */
  askStream(options: StreamRequestOptions): Promise<ClaudeResponse>;

  /** Multi-turn conversation */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ClaudeResponse>;

  /** Multi-turn conversation with streaming */
  chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    options?: ChatOptions
  ): Promise<ClaudeResponse>;

  /** Vision — text + image request */
  askWithImage(
    imageSource: ImageSource,
    prompt: string,
    options?: Omit<RequestOptions, 'prompt'>
  ): Promise<ClaudeResponse>;

  /** Check connectivity and availability */
  healthCheck(): Promise<HealthCheckResult>;

  /** List available models */
  listModels(): Promise<ModelInfo[]>;
}

/** Image source: either a local file path or a remote URL */
export interface ImageSource {
  type: 'file' | 'url';
  value: string;           // absolute file path OR full URL
  mediaType?: SupportedMediaType;
}

export type SupportedMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp';
