/**
 * Analytics Collector — v3.
 *
 * Appends one JSON event per API call to:
 *   ~/.claude-integration/analytics/events.jsonl
 *
 * Each event captures: timestamp, backend, model, tokens, cost, session, cache hit.
 */

import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import type { BackendMode } from '../utils/backendManager.js';

// ── Path ──────────────────────────────────────────────────────────

const ANALYTICS_DIR  = resolve(homedir(), '.claude-integration', 'analytics');
const EVENTS_FILE    = join(ANALYTICS_DIR, 'events.jsonl');

function ensureDir(): void {
  if (!existsSync(ANALYTICS_DIR)) mkdirSync(ANALYTICS_DIR, { recursive: true });
}

// ── Event schema ──────────────────────────────────────────────────

export interface AnalyticsEvent {
  ts: string;            // ISO timestamp
  backend: BackendMode;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  sessionId?: string;
  cacheHit: boolean;
  tool?: string;         // which MCP tool or CLI command triggered this
}

// ── Append ────────────────────────────────────────────────────────

/**
 * Record an API call event. Safe — never throws.
 */
export function recordEvent(event: AnalyticsEvent): void {
  try {
    ensureDir();
    appendFileSync(EVENTS_FILE, JSON.stringify(event) + '\n', 'utf-8');
  } catch {
    // Analytics should never break the main flow
  }
}

/**
 * Build an analytics event from a completed API response.
 */
export function buildEvent(params: {
  backend: BackendMode;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  sessionId?: string;
  cacheHit?: boolean;
  tool?: string;
}): AnalyticsEvent {
  return {
    ts: new Date().toISOString(),
    backend: params.backend,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costUsd: params.costUsd,
    durationMs: params.durationMs,
    sessionId: params.sessionId,
    cacheHit: params.cacheHit ?? false,
    tool: params.tool,
  };
}

export function getEventsFile(): string { return EVENTS_FILE; }
export function getAnalyticsDir(): string { return ANALYTICS_DIR; }
