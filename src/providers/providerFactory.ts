/**
 * Provider Factory — v3.
 *
 * Returns the AIProvider instance corresponding to the currently active backend.
 * Reads from ~/.claude-integration/config.json via backendManager.
 */

import { getActiveBackend } from '../utils/backendManager.js';
import { ClaudeProvider } from './claudeProvider.js';
import { AntigravityProvider } from './antigravityProvider.js';
import type { AIProvider } from './aiProvider.js';

let _cached: { mode: string; provider: AIProvider } | null = null;

/**
 * Get the active AIProvider. Cached per-process (same backend = same instance).
 */
export function getProvider(): AIProvider {
  const mode = getActiveBackend();

  if (_cached && _cached.mode === mode) return _cached.provider;

  const provider: AIProvider = mode === 'antigravity'
    ? new AntigravityProvider()
    : new ClaudeProvider();

  _cached = { mode, provider };
  return provider;
}

/** Force re-creation of the provider (used after backend switch). */
export function resetProvider(): void {
  _cached = null;
}
