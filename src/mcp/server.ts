#!/usr/bin/env node

/**
 * MCP Server for Claude Integration — v3.
 *
 * Communicates over stdio using JSON-RPC (MCP protocol).
 * ALL logging MUST go to stderr — stdout is exclusively for MCP protocol messages.
 *
 * v3 additions:
 *   Tools: claude_vision, claude_analyze_file, claude_process_files, claude_chain,
 *          claude_cache_stats, claude_backend_status
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { setMcpMode, setVerbose } from '../utils/logger.js';
import * as logger from '../utils/logger.js';

// v1/v2 handlers
import {
  handleClaudeAsk,
  handleClaudeHealth,
  handleClaudeListModels,
  handleClaudeExplainProject,
  handleClaudeEstimateCost,
  handleClaudeSessionList,
  handleClaudeSessionLoad,
  handleClaudeSessionChat,
} from './handlers.js';

// v3 handlers
import { handleClaudeVision } from './visionHandler.js';
import { handleClaudeAnalyzeFile, handleClaudeProcessFiles } from './fileHandler.js';
import { handleClaudeChain } from './chainHandler.js';

// v2 features
import { registerPrompts } from './prompts.js';
import { handleAnthropicError } from '../utils/errors.js';
import { listModels } from '../anthropicClient.js';
import { listSessions, formatSessionList } from '../utils/conversationStore.js';
import { getCacheStats, formatCacheStats } from '../utils/responseCache.js';
import { getActiveBackend, formatBackendStatus } from '../utils/backendManager.js';

// Force MCP mode — all logger output goes to stderr
setMcpMode(true);

if (process.env.MCP_VERBOSE === 'true' || process.env.MCP_VERBOSE === '1') {
  setVerbose(true);
}

import '../config.js';

async function main(): Promise<void> {
  logger.debug('Starting Claude MCP Server v3...');

  const server = new McpServer({
    name: 'claude-integration',
    version: '3.0.0',
  });

  // ── Resources ─────────────────────────────────────────────────────
  server.resource('models', 'claude://models', { description: 'Available Claude models' },
    async () => {
      try {
        const models = await listModels();
        const text = `Available Claude models (${models.length}):\n\n` +
          models.map((m) => `- ${m.id}  ${m.displayName ? `(${m.displayName})` : ''}`).join('\n');
        return { contents: [{ uri: 'claude://models', mimeType: 'text/plain', text }] };
      } catch (err) {
        return { contents: [{ uri: 'claude://models', mimeType: 'text/plain', text: `Error: ${handleAnthropicError(err)}` }] };
      }
    }
  );

  server.resource('conversations', 'claude://conversations', { description: 'Persisted conversation sessions' },
    async () => {
      const text = formatSessionList(listSessions());
      return { contents: [{ uri: 'claude://conversations', mimeType: 'text/plain', text }] };
    }
  );

  server.resource('analytics', 'claude://analytics', { description: 'Usage analytics summary' },
    async () => {
      const { aggregateMetrics } = await import('../analytics/aggregator.js');
      const m = aggregateMetrics();
      const text = [
        `Total requests:  ${m.totalRequests}`,
        `Total cost:      $${m.totalCostUsd.toFixed(6)}`,
        `Input tokens:    ${m.totalInputTokens.toLocaleString()}`,
        `Output tokens:   ${m.totalOutputTokens.toLocaleString()}`,
        `Cache hits:      ${m.totalCacheHits}`,
        `Avg duration:    ${m.averageDurationMs}ms`,
        '',
        `Active backend:  ${getActiveBackend()}`,
      ].join('\n');
      return { contents: [{ uri: 'claude://analytics', mimeType: 'text/plain', text }] };
    }
  );

  // ── Prompts (v2) ──────────────────────────────────────────────────
  registerPrompts(server);

  // ── Tools v1 ──────────────────────────────────────────────────────
  const toolWrap = (fn: () => Promise<string>) => async () => {
    try {
      return { content: [{ type: 'text' as const, text: await fn() }] };
    } catch (err) {
      return { content: [{ type: 'text' as const, text: `Error: ${handleAnthropicError(err)}` }], isError: true };
    }
  };

  server.tool('claude_ask', 'Send a prompt to Claude. Returns response + cost.', {
    prompt: z.string(), system: z.string().optional(), model: z.string().optional(),
    max_tokens: z.number().optional(), temperature: z.number().min(0).max(1).optional(),
  }, async (args) => toolWrap(() => handleClaudeAsk(args))());

  server.tool('claude_health', 'Check API connectivity.', {},
    async () => toolWrap(() => handleClaudeHealth())());

  server.tool('claude_list_models', 'List available Claude models.', {},
    async () => toolWrap(() => handleClaudeListModels())());

  server.tool('claude_explain_project', 'Explain a code snippet or project.', {
    code_or_summary: z.string(), language: z.string().optional(), context: z.string().optional(),
  }, async (args) => toolWrap(() => handleClaudeExplainProject(args))());

  // ── Tools v2 ──────────────────────────────────────────────────────
  server.tool('claude_estimate_cost', 'Estimate request cost before sending.', {
    prompt: z.string(), system: z.string().optional(), model: z.string().optional(),
    expected_output_tokens: z.number().optional(),
  }, async (args) => toolWrap(() => handleClaudeEstimateCost(args))());

  server.tool('claude_session_list', 'List saved conversation sessions.', {},
    async () => toolWrap(() => handleClaudeSessionList())());

  server.tool('claude_session_load', 'Load a session by ID or name.', {
    session_id: z.string(),
  }, async (args) => toolWrap(() => handleClaudeSessionLoad(args))());

  server.tool('claude_session_chat', 'Send a message in a persisted session.', {
    session_id: z.string(), message: z.string(), model: z.string().optional(),
    max_tokens: z.number().optional(), temperature: z.number().min(0).max(1).optional(),
  }, async (args) => toolWrap(() => handleClaudeSessionChat(args))());

  // ── Tools v3 ──────────────────────────────────────────────────────
  server.tool('claude_vision', 'Analyze an image with Claude Vision.', {
    image_path: z.string().optional().describe('Absolute local file path to image'),
    image_url: z.string().optional().describe('URL of image (JPEG, PNG, GIF, WebP)'),
    prompt: z.string().describe('What to ask about the image'),
    system: z.string().optional(),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
  }, async (args) => toolWrap(() => handleClaudeVision(args))());

  server.tool('claude_analyze_file', 'Analyze a single text/code file.', {
    file_path: z.string().describe('Absolute path to the file'),
    prompt: z.string().optional().describe('Custom analysis prompt'),
    system: z.string().optional(),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
  }, async (args) => toolWrap(() => handleClaudeAnalyzeFile(args))());

  server.tool('claude_process_files', 'Analyze multiple files in one request (batch).', {
    file_paths: z.array(z.string()).describe('Array of absolute file paths (max 10)'),
    prompt: z.string().optional().describe('Custom analysis prompt'),
    system: z.string().optional(),
    model: z.string().optional(),
    max_tokens: z.number().optional(),
  }, async (args) => toolWrap(() => handleClaudeProcessFiles(args))());

  server.tool('claude_chain', 'Execute a multi-step AI pipeline defined as JSON.', {
    chain: z.string().describe('JSON string: { name, steps: [{ id, tool, prompt, system? }] }'),
    input: z.string().optional().describe('Initial input to the chain'),
  }, async (args) => toolWrap(() => handleClaudeChain(args))());

  server.tool('claude_cache_stats', 'Show response cache statistics.', {},
    async () => {
      const stats = getCacheStats();
      return { content: [{ type: 'text' as const, text: formatCacheStats(stats) }] };
    });

  server.tool('claude_backend_status', 'Show the currently active AI backend (claude | antigravity).', {},
    async () => {
      return { content: [{ type: 'text' as const, text: formatBackendStatus() }] };
    });

  // ── Start ──────────────────────────────────────────────────────────
  const transport = new StdioServerTransport();

  process.on('SIGINT',  async () => { logger.debug('SIGINT'); await server.close(); process.exit(0); });
  process.on('SIGTERM', async () => { logger.debug('SIGTERM'); await server.close(); process.exit(0); });
  process.on('uncaughtException', (err) => { logger.error(`Uncaught: ${err.message}`); process.exit(1); });
  process.on('unhandledRejection', (reason) => { logger.error(`Rejection: ${reason}`); process.exit(1); });

  await server.connect(transport);
  logger.debug('Claude MCP Server v3 running on stdio');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
