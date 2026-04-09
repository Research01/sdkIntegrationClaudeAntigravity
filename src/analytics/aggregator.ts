/**
 * Analytics Aggregator — v3.
 *
 * Reads events.jsonl and produces aggregated metrics for the dashboard.
 */

import { readFileSync, existsSync } from 'fs';
import { getEventsFile } from './collector.js';
import type { AnalyticsEvent } from './collector.js';
import type { BackendMode } from '../utils/backendManager.js';

// ── Types ─────────────────────────────────────────────────────────

export interface DailyMetrics {
  date: string;                   // YYYY-MM-DD
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  cacheHits: number;
}

export interface ModelMetrics {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface BackendMetrics {
  backend: BackendMode;
  requests: number;
  costUsd: number;
}

export interface AggregatedMetrics {
  generatedAt: string;
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalCacheHits: number;
  averageDurationMs: number;
  byDay: DailyMetrics[];
  byModel: ModelMetrics[];
  byBackend: BackendMetrics[];
  last30Days: DailyMetrics[];
}

// ── Read events ───────────────────────────────────────────────────

export function readAllEvents(): AnalyticsEvent[] {
  const file = getEventsFile();
  if (!existsSync(file)) return [];

  const lines = readFileSync(file, 'utf-8').split('\n').filter(Boolean);
  const events: AnalyticsEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as AnalyticsEvent);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

// ── Aggregation ───────────────────────────────────────────────────

export function aggregateMetrics(): AggregatedMetrics {
  const events = readAllEvents();

  const dayMap = new Map<string, DailyMetrics>();
  const modelMap = new Map<string, ModelMetrics>();
  const backendMap = new Map<BackendMode, BackendMetrics>();

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let totalCacheHits = 0;
  let totalDurationMs = 0;

  for (const ev of events) {
    const date = ev.ts.slice(0, 10); // YYYY-MM-DD

    // By day
    if (!dayMap.has(date)) {
      dayMap.set(date, { date, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, cacheHits: 0 });
    }
    const day = dayMap.get(date)!;
    day.requests++;
    day.inputTokens += ev.inputTokens;
    day.outputTokens += ev.outputTokens;
    day.costUsd += ev.costUsd;
    if (ev.cacheHit) day.cacheHits++;

    // By model
    if (!modelMap.has(ev.model)) {
      modelMap.set(ev.model, { model: ev.model, requests: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 });
    }
    const model = modelMap.get(ev.model)!;
    model.requests++;
    model.inputTokens += ev.inputTokens;
    model.outputTokens += ev.outputTokens;
    model.costUsd += ev.costUsd;

    // By backend
    if (!backendMap.has(ev.backend)) {
      backendMap.set(ev.backend, { backend: ev.backend, requests: 0, costUsd: 0 });
    }
    const backend = backendMap.get(ev.backend)!;
    backend.requests++;
    backend.costUsd += ev.costUsd;

    // Totals
    totalInputTokens += ev.inputTokens;
    totalOutputTokens += ev.outputTokens;
    totalCostUsd += ev.costUsd;
    if (ev.cacheHit) totalCacheHits++;
    totalDurationMs += ev.durationMs;
  }

  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  // Last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const last30Days = byDay.filter((d) => new Date(d.date) >= cutoff);

  return {
    generatedAt: new Date().toISOString(),
    totalRequests: events.length,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    totalCacheHits,
    averageDurationMs: events.length > 0 ? Math.round(totalDurationMs / events.length) : 0,
    byDay,
    byModel: Array.from(modelMap.values()).sort((a, b) => b.requests - a.requests),
    byBackend: Array.from(backendMap.values()),
    last30Days,
  };
}
