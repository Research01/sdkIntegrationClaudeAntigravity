#!/usr/bin/env node

/**
 * MCP Server for Claude Integration.
 *
 * Communicates over stdio using JSON-RPC (MCP protocol).
 * ALL logging MUST go to stderr — stdout is exclusively for MCP protocol messages.
 *
 * Dotenv banner suppression: config.ts uses dotenvConfig({ quiet: true }) so the
 * "◆ injecting env" banner from dotenv v17 never reaches stdout.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { setMcpMode, setVerbose } from '../utils/logger.js';
import * as logger from '../utils/logger.js';
import { handleClaudeAsk, handleClaudeHealth, handleClaudeListModels, handleClaudeExplainProject } from './handlers.js';
import { handleAnthropicError } from '../utils/errors.js';

// Force MCP mode — all logger output goes to stderr
setMcpMode(true);

// Enable verbose debug logging to stderr if requested
if (process.env.MCP_VERBOSE === 'true' || process.env.MCP_VERBOSE === '1') {
  setVerbose(true);
}

// Load .env — dotenvConfig({ quiet: true }) suppresses the dotenv v17 banner on stdout
import '../config.js';

async function main(): Promise<void> {
  logger.debug('Starting Claude MCP Server...');

  const server = new McpServer({
    name: 'claude-integration',
    version: '1.0.0',
  });

  // ── Tool: claude_ask ──────────────────────────────────────────────
  server.tool(
    'claude_ask',
    'Send a prompt to Claude and receive a text response. Supports optional system prompt, model, max_tokens, and temperature.',
    {
      prompt: z.string().describe('The prompt to send to Claude'),
      system: z.string().optional().describe('Optional system prompt'),
      model: z.string().optional().describe('Model to use'),
      max_tokens: z.number().optional().describe('Max tokens for response'),
      temperature: z.number().min(0).max(1).optional().describe('Temperature (0.0–1.0)'),
    },
    async (args) => {
      try {
        const result = await handleClaudeAsk(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        const message = handleAnthropicError(err);
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ── Tool: claude_health ───────────────────────────────────────────
  server.tool(
    'claude_health',
    'Validate Claude API configuration and connectivity.',
    {},
    async () => {
      try {
        const result = await handleClaudeHealth();
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        const message = handleAnthropicError(err);
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ── Tool: claude_list_models ──────────────────────────────────────
  server.tool(
    'claude_list_models',
    'List available Claude models from the Anthropic API.',
    {},
    async () => {
      try {
        const result = await handleClaudeListModels();
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        const message = handleAnthropicError(err);
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ── Tool: claude_explain_project ──────────────────────────────────
  server.tool(
    'claude_explain_project',
    'Explain a code snippet or project summary in detail. Provide technical analysis including purpose, architecture, and suggestions.',
    {
      code_or_summary: z.string().describe('Code or summary to explain'),
      language: z.string().optional().describe('Programming language'),
      context: z.string().optional().describe('Additional project context'),
    },
    async (args) => {
      try {
        const result = await handleClaudeExplainProject(args);
        return { content: [{ type: 'text' as const, text: result }] };
      } catch (err) {
        const message = handleAnthropicError(err);
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
      }
    }
  );

  // ── Start the server ──────────────────────────────────────────────
  const transport = new StdioServerTransport();

  // Clean shutdown handlers
  process.on('SIGINT', async () => {
    logger.debug('Received SIGINT, shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.debug('Received SIGTERM, shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.message}`);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
    process.exit(1);
  });

  await server.connect(transport);
  logger.debug('Claude MCP Server running on stdio');
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
