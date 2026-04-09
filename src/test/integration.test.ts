/**
 * Integration Tests — v3.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 *
 * Run: npm run test
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import { tmpdir } from 'os';

// ── Cost Estimator tests ──────────────────────────────────────────

describe('costEstimator', async () => {
  const { estimateCost, calculateActualCost, estimateTokenCount, getPricing } = await import('../utils/costEstimator.js');

  it('estimateTokenCount: empty string returns 0', () => {
    assert.equal(estimateTokenCount(''), 0);
  });

  it('estimateTokenCount: 40-char string ≈ 10 tokens', () => {
    const tokens = estimateTokenCount('A'.repeat(40));
    assert.ok(tokens >= 9 && tokens <= 11, `Expected ~10 tokens, got ${tokens}`);
  });

  it('getPricing: sonnet model returns correct price', () => {
    const p = getPricing('claude-sonnet-4-20250514');
    assert.equal(p.inputMtok, 3.00);
    assert.equal(p.outputMtok, 15.00);
  });

  it('getPricing: unknown model falls back to sonnet tier', () => {
    const p = getPricing('claude-future-model-9999');
    assert.ok(p.inputMtok > 0);
    assert.ok(p.outputMtok > 0);
  });

  it('estimateCost: totalCostUsd = inputCostUsd + outputCostUsd', () => {
    const est = estimateCost('claude-sonnet-4-20250514', 'Hello world', undefined, 500);
    assert.ok(Math.abs(est.totalCostUsd - (est.inputCostUsd + est.outputCostUsd)) < 0.000001);
  });

  it('calculateActualCost: 1M input tokens = inputMtok price', () => {
    const cost = calculateActualCost('claude-sonnet-4-20250514', 1_000_000, 0);
    assert.ok(Math.abs(cost - 3.00) < 0.001);
  });

  it('estimateCost: haiku is cheaper than opus', () => {
    const haiku = estimateCost('claude-haiku-3-5-20241022', 'test', undefined, 1000);
    const opus  = estimateCost('claude-opus-4-20250514', 'test', undefined, 1000);
    assert.ok(haiku.totalCostUsd < opus.totalCostUsd);
  });
});

// ── Conversation Store tests ──────────────────────────────────────

describe('conversationStore', async () => {
  // Use a temp dir to avoid polluting real store
  const testDir = join(tmpdir(), `claude-test-${Date.now()}`);
  process.env['HOME'] = testDir; // Override homedir temporarily

  const {
    createSession, saveSession, loadSession, loadSessionByName,
    listSessions, deleteSession, appendUserMessage, appendAssistantMessage,
  } = await import('../utils/conversationStore.js');

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('createSession: produces a valid session object', () => {
    const s = createSession('test-session');
    assert.equal(s.name, 'test-session');
    assert.ok(s.id.length > 10);
    assert.deepEqual(s.messages, []);
    assert.equal(s.metadata.turnCount, 0);
  });

  it('saveSession + loadSession: round-trips correctly', () => {
    const s = createSession('my-session');
    appendUserMessage(s, 'Hello');
    saveSession(s);

    const loaded = loadSession(s.id);
    assert.ok(loaded !== null);
    assert.equal(loaded!.name, 'my-session');
    assert.equal(loaded!.messages.length, 1);
    assert.equal(loaded!.messages[0].content, 'Hello');
  });

  it('loadSessionByName: finds session by name', () => {
    const s = createSession('named-session');
    saveSession(s);
    const loaded = loadSessionByName('named-session');
    assert.ok(loaded !== null);
    assert.equal(loaded!.id, s.id);
  });

  it('loadSession: returns null for unknown ID', () => {
    const result = loadSession('00000000-0000-0000-0000-000000000000');
    assert.equal(result, null);
  });

  it('listSessions: returns all saved sessions', () => {
    const a = createSession('alpha'); saveSession(a);
    const b = createSession('beta');  saveSession(b);
    const list = listSessions();
    assert.ok(list.length >= 2);
  });

  it('deleteSession: removes session from disk', () => {
    const s = createSession('delete-me');
    saveSession(s);
    const deleted = deleteSession(s.id);
    assert.equal(deleted, true);
    assert.equal(loadSession(s.id), null);
  });

  it('appendAssistantMessage: updates metadata correctly', () => {
    const s = createSession('meta-test');
    appendUserMessage(s, 'Hi');
    appendAssistantMessage(s, 'Hello!', 10, 5, 0.0001);
    assert.equal(s.metadata.turnCount, 1);
    assert.equal(s.metadata.totalInputTokens, 10);
    assert.equal(s.metadata.totalOutputTokens, 5);
    assert.ok(s.metadata.totalCostUsd > 0);
  });
});

// ── Response Cache tests ──────────────────────────────────────────

describe('responseCache', async () => {
  const testDir = join(tmpdir(), `claude-cache-test-${Date.now()}`);
  process.env['HOME'] = testDir;
  process.env['CACHE_ENABLED'] = 'true';
  process.env['CACHE_TTL_HOURS'] = '1';

  const { buildCacheKey, getFromCache, setInCache, clearCache, getCacheStats } = await import('../utils/responseCache.js');

  const fakeResponse = {
    content: 'Hello from cache',
    model: 'claude-sonnet-4-20250514',
    usage: { inputTokens: 10, outputTokens: 5 },
    stopReason: 'end_turn',
  };

  afterEach(() => {
    clearCache();
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('buildCacheKey: same params produce same key', () => {
    const params = { model: 'claude-sonnet-4-20250514', prompt: 'Hello', system: 'Be helpful', temperature: 0.7 };
    assert.equal(buildCacheKey(params), buildCacheKey(params));
  });

  it('buildCacheKey: different prompts produce different keys', () => {
    const k1 = buildCacheKey({ model: 'm', prompt: 'Hello', temperature: 0.7 });
    const k2 = buildCacheKey({ model: 'm', prompt: 'Hi', temperature: 0.7 });
    assert.notEqual(k1, k2);
  });

  it('getFromCache: miss before set', () => {
    const key = buildCacheKey({ model: 'm', prompt: 'test', temperature: 0.7 });
    assert.equal(getFromCache(key), null);
  });

  it('setInCache + getFromCache: round-trips correctly', () => {
    const params = { model: 'claude-sonnet-4-20250514', prompt: 'Cached?', temperature: 0.5 };
    const key = buildCacheKey(params);
    setInCache(key, fakeResponse, params);
    const cached = getFromCache(key);
    assert.ok(cached !== null);
    assert.equal(cached!.content, 'Hello from cache');
  });

  it('getCacheStats: reflects written entries', () => {
    const params = { model: 'm', prompt: 'stats test', temperature: 0.7 };
    const key = buildCacheKey(params);
    setInCache(key, fakeResponse, params);
    const stats = getCacheStats();
    assert.ok(stats.totalEntries >= 1);
    assert.ok(stats.validEntries >= 1);
  });

  it('clearCache: removes all entries', () => {
    const params = { model: 'm', prompt: 'clear test', temperature: 0.7 };
    const key = buildCacheKey(params);
    setInCache(key, fakeResponse, params);
    clearCache();
    assert.equal(getFromCache(key), null);
  });
});

// ── Backend Manager tests ─────────────────────────────────────────

describe('backendManager', async () => {
  const testDir = join(tmpdir(), `claude-backend-test-${Date.now()}`);
  process.env['HOME'] = testDir;

  const { getActiveBackend, setBackend, getBackendConfig } = await import('../utils/backendManager.js');

  afterEach(() => {
    try { rmSync(testDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('getActiveBackend: defaults to claude', () => {
    assert.equal(getActiveBackend(), 'claude');
  });

  it('setBackend: switches to antigravity', () => {
    setBackend('antigravity');
    assert.equal(getActiveBackend(), 'antigravity');
  });

  it('setBackend: records history', () => {
    setBackend('antigravity');
    setBackend('claude');
    const config = getBackendConfig();
    assert.ok(config.history.length >= 1);
  });
});
