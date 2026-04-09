import { z } from 'zod';

/**
 * MCP Tool definitions for Claude integration.
 * Each tool has a name, description, and Zod input schema.
 */

export const TOOL_DEFINITIONS = {
  claude_ask: {
    name: 'claude_ask',
    description:
      'Send a prompt to Claude and receive a text response. ' +
      'Supports optional system prompt, model selection, max tokens, and temperature.',
    inputSchema: {
      prompt: z.string().describe('The prompt to send to Claude'),
      system: z.string().optional().describe('Optional system prompt to set context'),
      model: z.string().optional().describe('Model to use (e.g. claude-sonnet-4-20250514)'),
      max_tokens: z.number().optional().describe('Maximum tokens for the response'),
      temperature: z.number().min(0).max(1).optional().describe('Temperature (0.0–1.0)'),
    },
  },

  claude_health: {
    name: 'claude_health',
    description:
      'Validate Claude API configuration and connectivity. ' +
      'Returns status, model info, API reachability, and latency.',
    inputSchema: {},
  },

  claude_list_models: {
    name: 'claude_list_models',
    description:
      'List all available Claude models from the Anthropic API. ' +
      'Returns model IDs, display names, and creation dates.',
    inputSchema: {},
  },

  claude_explain_project: {
    name: 'claude_explain_project',
    description:
      'Receive a code snippet or project summary and return a detailed technical explanation. ' +
      'Useful for understanding unfamiliar code or architecture.',
    inputSchema: {
      code_or_summary: z.string().describe('The code snippet or project summary to explain'),
      language: z.string().optional().describe('Programming language of the code (e.g. typescript, python)'),
      context: z.string().optional().describe('Additional context about the project or code'),
    },
  },
} as const;
