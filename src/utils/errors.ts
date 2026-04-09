import Anthropic from '@anthropic-ai/sdk';
import * as logger from './logger.js';

/**
 * Standardized error handling for Anthropic API errors.
 * Returns a user-friendly error message.
 */
export function handleAnthropicError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Authentication failed. Please check your ANTHROPIC_API_KEY.\n' +
           'Ensure the key is valid and has not been revoked.\n' +
           'Get a new key at: https://console.anthropic.com/';
  }

  if (err instanceof Anthropic.RateLimitError) {
    return 'Rate limit exceeded. Please wait a moment and try again.\n' +
           'If this persists, check your plan limits at https://console.anthropic.com/';
  }

  if (err instanceof Anthropic.BadRequestError) {
    const msg = (err as Error).message || '';
    if (msg.includes('model')) {
      return `Invalid model specified. ${msg}\n` +
             'Run "npm run models" to see available models.';
    }
    return `Bad request: ${msg}`;
  }

  if (err instanceof Anthropic.NotFoundError) {
    return 'Model not found. The specified model may not exist or may not be available for your account.\n' +
           'Run "npm run models" to see available models.';
  }

  if (err instanceof Anthropic.APIConnectionError) {
    return 'Could not connect to the Anthropic API.\n' +
           'Please check your network connection and ANTHROPIC_BASE_URL setting.';
  }

  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return 'Request timed out. Consider increasing ANTHROPIC_TIMEOUT_MS in your .env file.';
  }

  if (err instanceof Anthropic.APIError) {
    return `Anthropic API error (${err.status}): ${err.message}`;
  }

  if (err instanceof Error) {
    return `Unexpected error: ${err.message}`;
  }

  return `Unknown error: ${String(err)}`;
}

/**
 * Wraps an async operation with standardized error handling.
 * Returns [result, null] on success, [null, errorMessage] on failure.
 */
export async function safeExecute<T>(
  fn: () => Promise<T>,
  context: string
): Promise<[T, null] | [null, string]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (err) {
    const message = handleAnthropicError(err);
    logger.error(`${context}: ${message}`);
    return [null, message];
  }
}
