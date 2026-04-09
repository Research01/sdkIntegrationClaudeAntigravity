/**
 * Conversation Store — v2 feature.
 *
 * Persists named conversation sessions as JSON files in:
 *   ~/.claude-integration/conversations/<session-id>.json
 *
 * Supports multiple concurrent sessions via unique session IDs.
 * Each session carries full message history, token totals, and cost tracking.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import { randomUUID } from 'crypto';
import type { ConversationSession, ChatMessage } from '../types.js';

// ── Storage path ──────────────────────────────────────────────────

const STORE_DIR = resolve(homedir(), '.claude-integration', 'conversations');

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function sessionPath(sessionId: string): string {
  return join(STORE_DIR, `${sessionId}.json`);
}

// ── CRUD operations ───────────────────────────────────────────────

/**
 * Create a new empty session.
 */
export function createSession(name: string, options?: {
  model?: string;
  system?: string;
}): ConversationSession {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    model: options?.model,
    system: options?.system,
    messages: [],
    metadata: {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      turnCount: 0,
    },
  };
}

/**
 * Save (create or update) a session to disk.
 */
export function saveSession(session: ConversationSession): void {
  ensureStoreDir();
  session.updatedAt = new Date().toISOString();
  writeFileSync(sessionPath(session.id), JSON.stringify(session, null, 2), 'utf-8');
}

/**
 * Load a session by ID. Returns null if not found.
 */
export function loadSession(sessionId: string): ConversationSession | null {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return null;
  try {
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as ConversationSession;
  } catch {
    return null;
  }
}

/**
 * Load a session by name (first match). Returns null if not found.
 */
export function loadSessionByName(name: string): ConversationSession | null {
  const all = listSessions();
  return all.find((s) => s.name === name) ?? null;
}

/**
 * List all saved sessions, sorted by updatedAt descending.
 */
export function listSessions(): ConversationSession[] {
  ensureStoreDir();
  const files = readdirSync(STORE_DIR).filter((f) => f.endsWith('.json'));
  const sessions: ConversationSession[] = [];

  for (const file of files) {
    try {
      const raw = readFileSync(join(STORE_DIR, file), 'utf-8');
      sessions.push(JSON.parse(raw) as ConversationSession);
    } catch {
      // Skip corrupted files
    }
  }

  return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Delete a session by ID. Returns true if deleted, false if not found.
 */
export function deleteSession(sessionId: string): boolean {
  const path = sessionPath(sessionId);
  if (!existsSync(path)) return false;
  unlinkSync(path);
  return true;
}

// ── Session mutation helpers ──────────────────────────────────────

/**
 * Append a user message to a session (does NOT save to disk).
 */
export function appendUserMessage(session: ConversationSession, content: string): void {
  session.messages.push({ role: 'user', content });
}

/**
 * Append an assistant message and update token/cost metadata.
 */
export function appendAssistantMessage(
  session: ConversationSession,
  content: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): void {
  session.messages.push({ role: 'assistant', content });
  session.metadata.totalInputTokens  += inputTokens;
  session.metadata.totalOutputTokens += outputTokens;
  session.metadata.totalCostUsd      += costUsd;
  session.metadata.turnCount         += 1;
}

// ── Formatting helpers ────────────────────────────────────────────

/**
 * Format a session summary as a human-readable table row.
 */
export function formatSessionSummary(session: ConversationSession): string {
  const turns  = session.metadata.turnCount;
  const cost   = `$${session.metadata.totalCostUsd.toFixed(4)}`;
  const date   = session.updatedAt.slice(0, 10);
  return `[${session.id.slice(0, 8)}] ${session.name.padEnd(24)} ${String(turns).padStart(3)} turns | ${cost.padStart(10)} | ${date}`;
}

/**
 * Format all sessions as a multi-line string.
 */
export function formatSessionList(sessions: ConversationSession[]): string {
  if (sessions.length === 0) return 'No saved sessions.';
  const header = 'ID         Name                     Turns | Cost       | Date';
  const sep    = '─'.repeat(header.length);
  const rows   = sessions.map(formatSessionSummary);
  return [header, sep, ...rows].join('\n');
}

/**
 * Return the store directory path (useful for debug/info).
 */
export function getStoreDir(): string {
  return STORE_DIR;
}
