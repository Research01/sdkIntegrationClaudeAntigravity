/**
 * Backend Manager — v3.
 *
 * Persists the active AI backend (claude | antigravity) in:
 *   ~/.claude-integration/config.json
 *
 * Commands:
 *   npm run backend           → show active backend
 *   npm run use:claude        → switch to Claude API (pay-as-you-go)
 *   npm run use:antigravity   → switch to Antigravity (subscription)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';

// ── Types ─────────────────────────────────────────────────────────

export type BackendMode = 'claude' | 'antigravity';

export interface BackendConfig {
  activeBackend: BackendMode;
  switchedAt: string;
  history: Array<{ backend: BackendMode; switchedAt: string }>;
}

// ── Paths ─────────────────────────────────────────────────────────

const CONFIG_DIR  = resolve(homedir(), '.claude-integration');
const CONFIG_FILE = resolve(CONFIG_DIR, 'config.json');

// ── Defaults ──────────────────────────────────────────────────────

const DEFAULT_CONFIG: BackendConfig = {
  activeBackend: 'claude',
  switchedAt: new Date().toISOString(),
  history: [],
};

// ── I/O ───────────────────────────────────────────────────────────

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readConfig(): BackendConfig {
  ensureConfigDir();
  if (!existsSync(CONFIG_FILE)) {
    writeConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(raw) as BackendConfig;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function writeConfig(config: BackendConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Get the currently active backend mode.
 */
export function getActiveBackend(): BackendMode {
  return readConfig().activeBackend;
}

/**
 * Get the full backend configuration.
 */
export function getBackendConfig(): BackendConfig {
  return readConfig();
}

/**
 * Switch to a different backend and persist the change.
 */
export function setBackend(mode: BackendMode): void {
  const config = readConfig();
  const prev = config.activeBackend;

  if (prev === mode) return; // no-op

  config.history.push({ backend: prev, switchedAt: config.switchedAt });
  // Keep only last 20 history entries
  if (config.history.length > 20) config.history = config.history.slice(-20);

  config.activeBackend = mode;
  config.switchedAt = new Date().toISOString();

  writeConfig(config);
}

/**
 * Returns a human-readable status string for the active backend.
 */
export function formatBackendStatus(): string {
  const config = readConfig();
  const mode = config.activeBackend;

  const labels: Record<BackendMode, { icon: string; label: string; desc: string }> = {
    claude: {
      icon: '🟣',
      label: 'Claude API',
      desc: 'Direct Anthropic API calls — pay-as-you-go with your ANTHROPIC_API_KEY',
    },
    antigravity: {
      icon: '🟢',
      label: 'Antigravity',
      desc: 'Routed through Google Antigravity — uses your active subscription',
    },
  };

  const { icon, label, desc } = labels[mode];
  const since = new Date(config.switchedAt).toLocaleString();

  return [
    '',
    `${icon}  Active backend: ${label}`,
    `   ${desc}`,
    `   Active since: ${since}`,
    '',
    '   Switch backends:',
    '     npm run use:claude        → Claude API (pay-as-you-go)',
    '     npm run use:antigravity   → Antigravity (subscription)',
    '',
  ].join('\n');
}

/**
 * Config file path — useful for diagnostics.
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
