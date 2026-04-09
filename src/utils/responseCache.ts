/**
 * Response Cache — v3.
 *
 * Caches Claude responses to disk to avoid repeated API calls for identical prompts.
 *
 * Cache location:  ~/.claude-integration/cache/
 * Cache key:       SHA-256 of (model + prompt + system + temperature)
 * TTL:             CACHE_TTL_HOURS env var (default: 24h)
 * Enable/disable:  CACHE_ENABLED=true in .env
 *
 * Commands:
 *   npm run cache:stats   → show cache statistics
 *   npm run cache:clear   → delete all cached responses
 */

import { createHash } from 'crypto';
import {
  readFileSync, writeFileSync, readdirSync,
  existsSync, mkdirSync, unlinkSync, statSync,
} from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { ClaudeResponse } from '../types.js';

// ── Paths & Config ────────────────────────────────────────────────

const CACHE_DIR = resolve(homedir(), '.claude-integration', 'cache');

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

function isCacheEnabled(): boolean {
  return process.env.CACHE_ENABLED === 'true' || process.env.CACHE_ENABLED === '1';
}

function getTtlHours(): number {
  const raw = process.env.CACHE_TTL_HOURS;
  if (!raw) return 24;
  const parsed = parseFloat(raw);
  return isNaN(parsed) || parsed <= 0 ? 24 : parsed;
}

// ── Cache entry ────────────────────────────────────────────────────

interface CacheEntry {
  key: string;
  cachedAt: string;
  expiresAt: string;
  params: {
    model: string;
    prompt: string;
    system?: string;
    temperature?: number;
  };
  response: ClaudeResponse;
}

// ── Key generation ─────────────────────────────────────────────────

export function buildCacheKey(params: {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
}): string {
  const canonical = JSON.stringify({
    model: params.model,
    prompt: params.prompt,
    system: params.system ?? '',
    temperature: params.temperature ?? 0.7,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

function cachePath(key: string): string {
  return join(CACHE_DIR, `${key}.json`);
}

// ── Read / Write ──────────────────────────────────────────────────

/**
 * Attempt to read a cached response. Returns null on miss or expired.
 */
export function getFromCache(key: string): ClaudeResponse | null {
  if (!isCacheEnabled()) return null;
  const file = cachePath(key);
  if (!existsSync(file)) return null;

  try {
    const entry = JSON.parse(readFileSync(file, 'utf-8')) as CacheEntry;
    const now = Date.now();
    const expires = new Date(entry.expiresAt).getTime();

    if (now > expires) {
      // Expired — delete and miss
      unlinkSync(file);
      return null;
    }

    return entry.response;
  } catch {
    return null;
  }
}

/**
 * Write a response to the cache.
 */
export function setInCache(
  key: string,
  response: ClaudeResponse,
  params: { model: string; prompt: string; system?: string; temperature?: number },
): void {
  if (!isCacheEnabled()) return;
  ensureCacheDir();

  const now = new Date();
  const ttlMs = getTtlHours() * 60 * 60 * 1000;
  const expires = new Date(now.getTime() + ttlMs);

  const entry: CacheEntry = {
    key,
    cachedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    params,
    response,
  };

  writeFileSync(cachePath(key), JSON.stringify(entry, null, 2), 'utf-8');
}

// ── Cache management ──────────────────────────────────────────────

export interface CacheStats {
  totalEntries: number;
  expiredEntries: number;
  validEntries: number;
  totalSizeBytes: number;
  oldestEntry?: string;
  newestEntry?: string;
}

/**
 * Get cache statistics.
 */
export function getCacheStats(): CacheStats {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const now = Date.now();

  let totalSize = 0;
  let expired = 0;
  let oldest: string | undefined;
  let newest: string | undefined;

  for (const file of files) {
    const filePath = join(CACHE_DIR, file);
    const stat = statSync(filePath);
    totalSize += stat.size;

    try {
      const entry = JSON.parse(readFileSync(filePath, 'utf-8')) as CacheEntry;
      const isExpired = now > new Date(entry.expiresAt).getTime();
      if (isExpired) expired++;

      if (!oldest || entry.cachedAt < oldest) oldest = entry.cachedAt;
      if (!newest || entry.cachedAt > newest) newest = entry.cachedAt;
    } catch {
      expired++;
    }
  }

  return {
    totalEntries: files.length,
    expiredEntries: expired,
    validEntries: files.length - expired,
    totalSizeBytes: totalSize,
    oldestEntry: oldest,
    newestEntry: newest,
  };
}

/**
 * Delete all cache entries. Returns count deleted.
 */
export function clearCache(): number {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    try { unlinkSync(join(CACHE_DIR, file)); } catch { /* ignore */ }
  }
  return files.length;
}

/**
 * Delete only expired cache entries. Returns count deleted.
 */
export function pruneExpiredCache(): number {
  ensureCacheDir();
  const files = readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'));
  const now = Date.now();
  let count = 0;

  for (const file of files) {
    const filePath = join(CACHE_DIR, file);
    try {
      const entry = JSON.parse(readFileSync(filePath, 'utf-8')) as CacheEntry;
      if (now > new Date(entry.expiresAt).getTime()) {
        unlinkSync(filePath);
        count++;
      }
    } catch {
      unlinkSync(filePath);
      count++;
    }
  }

  return count;
}

/**
 * Format cache stats as a human-readable string.
 */
export function formatCacheStats(stats: CacheStats): string {
  const kb = (stats.totalSizeBytes / 1024).toFixed(1);
  return [
    `Cache location:   ${CACHE_DIR}`,
    `Total entries:    ${stats.totalEntries}`,
    `  Valid:          ${stats.validEntries}`,
    `  Expired:        ${stats.expiredEntries}`,
    `Total size:       ${kb} KB`,
    `Oldest entry:     ${stats.oldestEntry ? new Date(stats.oldestEntry).toLocaleString() : '—'}`,
    `Newest entry:     ${stats.newestEntry ? new Date(stats.newestEntry).toLocaleString() : '—'}`,
    `TTL:              ${getTtlHours()}h (CACHE_TTL_HOURS)`,
    `Status:           ${isCacheEnabled() ? '✅ Enabled' : '⏸️  Disabled (set CACHE_ENABLED=true)'}`,
  ].join('\n');
}

export function getCacheDir(): string { return CACHE_DIR; }
