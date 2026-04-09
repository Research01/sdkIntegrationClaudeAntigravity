import { config as dotenvConfig } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { AppConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the project root (one level up from src/ or dist/)
const envPath = resolve(__dirname, '..', '.env');
if (existsSync(envPath)) {
  // quiet: true suppresses the dotenv v17 banner ("◆ injecting env") that writes to stdout.
  // Stdout must stay clean for MCP stdio transport (JSON-RPC protocol).
  dotenvConfig({ path: envPath, quiet: true });
} else {
  // Also try two levels up in case we're in dist/
  const envPathAlt = resolve(__dirname, '..', '..', '.env');
  if (existsSync(envPathAlt)) {
    dotenvConfig({ path: envPathAlt, quiet: true });
  }
}

/** Default model — updated to a current, non-deprecated model */
export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';

/** Default max tokens */
export const DEFAULT_MAX_TOKENS = 4096;

/** Default base URL */
export const DEFAULT_BASE_URL = 'https://api.anthropic.com';

/** Default timeout (2 minutes) */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Default temperature */
export const DEFAULT_TEMPERATURE = 0.7;

/**
 * Load and validate the application config from environment variables.
 * Throws with a clear message if required variables are missing.
 */
export function loadConfig(): AppConfig {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || apiKey.trim() === '' || apiKey === 'sk-ant-...') {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured.\n' +
      'Please copy .env.example to .env and set your API key.\n' +
      'Get one at: https://console.anthropic.com/'
    );
  }

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const maxTokens = parsePositiveInt(process.env.ANTHROPIC_MAX_TOKENS, DEFAULT_MAX_TOKENS, 'ANTHROPIC_MAX_TOKENS');
  const baseUrl = process.env.ANTHROPIC_BASE_URL || DEFAULT_BASE_URL;
  const timeoutMs = parsePositiveInt(process.env.ANTHROPIC_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 'ANTHROPIC_TIMEOUT_MS');
  const temperature = parseFloat(process.env.ANTHROPIC_TEMPERATURE || String(DEFAULT_TEMPERATURE));

  if (isNaN(temperature) || temperature < 0 || temperature > 1) {
    throw new Error('ANTHROPIC_TEMPERATURE must be a number between 0.0 and 1.0');
  }

  return { apiKey, model, maxTokens, baseUrl, timeoutMs, temperature };
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got: "${raw}"`);
  }
  return parsed;
}
