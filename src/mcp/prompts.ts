/**
 * MCP Prompts — v2 feature.
 *
 * Pre-built prompt templates registered with the MCP server.
 * Each prompt can accept dynamic arguments to customize the template.
 *
 * Registered prompts:
 *   - code_review      : Structured code review with actionable feedback
 *   - explain_code     : Detailed technical explanation of code
 *   - write_tests      : Unit test generation for a function/module
 *   - summarize        : Concise summary of long text
 *   - debug_error      : Step-by-step error diagnosis and fix
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register all v2 prompt templates with the MCP server.
 */
export function registerPrompts(server: McpServer): void {

  // ── Prompt: code_review ─────────────────────────────────────────
  server.prompt(
    'code_review',
    'Perform a structured code review with feedback on correctness, performance, security, and style.',
    {
      code: z.string().describe('The code to review'),
      language: z.string().optional().describe('Programming language (e.g. typescript, python)'),
      focus: z.string().optional().describe('Specific area to focus on (e.g. security, performance)'),
    },
    ({ code, language, focus }) => {
      const lang = language ? ` in ${language}` : '';
      const focusPart = focus
        ? `\n\nPay special attention to: **${focus}**.`
        : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Please review the following code${lang} and provide structured feedback.${focusPart}`,
                '',
                'Your review should cover:',
                '1. **Correctness** — logic bugs, edge cases, off-by-one errors',
                '2. **Performance** — inefficiencies, unnecessary allocations, O(n) concerns',
                '3. **Security** — vulnerabilities, injection risks, improper input handling',
                '4. **Maintainability** — readability, naming, structure, DRY principles',
                '5. **Suggestions** — specific improvements with example rewrites where helpful',
                '',
                '```',
                code,
                '```',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // ── Prompt: explain_code ────────────────────────────────────────
  server.prompt(
    'explain_code',
    'Get a detailed technical explanation of a code snippet or module.',
    {
      code: z.string().describe('The code to explain'),
      language: z.string().optional().describe('Programming language'),
      audience: z.enum(['beginner', 'intermediate', 'expert']).optional().describe('Target audience level'),
    },
    ({ code, language, audience }) => {
      const lang = language ? ` written in ${language}` : '';
      const level = audience === 'beginner'
        ? 'Explain in simple terms, avoiding jargon where possible.'
        : audience === 'expert'
        ? 'Assume deep technical knowledge. Go into internals, trade-offs, and patterns.'
        : 'Assume intermediate programming knowledge.';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Explain the following code${lang}. ${level}`,
                '',
                'Cover:',
                '- **What it does** — the overall purpose',
                '- **How it works** — step-by-step walkthrough of key logic',
                '- **Key concepts** — patterns, algorithms, or APIs used',
                '- **Potential gotchas** — edge cases or surprising behaviors',
                '',
                '```',
                code,
                '```',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // ── Prompt: write_tests ─────────────────────────────────────────
  server.prompt(
    'write_tests',
    'Generate unit tests for a function or module.',
    {
      code: z.string().describe('The function or module to test'),
      language: z.string().optional().describe('Programming language'),
      framework: z.string().optional().describe('Test framework (e.g. jest, pytest, vitest)'),
    },
    ({ code, language, framework }) => {
      const lang = language ? ` ${language}` : '';
      const fw   = framework ? ` using ${framework}` : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Write comprehensive unit tests${lang}${fw} for the following code.`,
                '',
                'Include tests for:',
                '- Happy path (expected inputs and outputs)',
                '- Edge cases (empty input, nulls, boundaries)',
                '- Error cases (invalid input, exceptions)',
                '- Any async behavior if applicable',
                '',
                'Provide runnable test code with clear test descriptions.',
                '',
                '```',
                code,
                '```',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // ── Prompt: summarize ───────────────────────────────────────────
  server.prompt(
    'summarize',
    'Generate a concise, structured summary of a long text.',
    {
      text: z.string().describe('The text to summarize'),
      format: z.enum(['bullet_points', 'paragraph', 'tldr']).optional().describe('Output format'),
      max_words: z.number().optional().describe('Approximate maximum words for the summary'),
    },
    ({ text, format, max_words }) => {
      const fmt = format === 'bullet_points'
        ? 'Use bullet points.'
        : format === 'tldr'
        ? 'Write a TL;DR of 1–3 sentences.'
        : 'Write in clear prose paragraphs.';

      const limit = max_words ? ` Keep it under ${max_words} words.` : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `Summarize the following text. ${fmt}${limit}`,
                '',
                text,
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // ── Prompt: debug_error ─────────────────────────────────────────
  server.prompt(
    'debug_error',
    'Diagnose an error message and provide a step-by-step fix.',
    {
      error: z.string().describe('The error message or stack trace'),
      code: z.string().optional().describe('The code that produced the error'),
      language: z.string().optional().describe('Programming language'),
      context: z.string().optional().describe('Additional context about what you were trying to do'),
    },
    ({ error, code, language, context }) => {
      const lang = language ? ` (${language})` : '';
      const codePart = code
        ? `\n\nCode that produced the error:\n\`\`\`\n${code}\n\`\`\``
        : '';
      const ctxPart = context ? `\n\nContext: ${context}` : '';

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: [
                `I got the following error${lang}. Please diagnose it and provide a fix.`,
                '',
                '**Error:**',
                '```',
                error,
                '```',
                codePart,
                ctxPart,
                '',
                'Please provide:',
                '1. **Root cause** — what is causing this error',
                '2. **Fix** — the exact code change or command to resolve it',
                '3. **Prevention** — how to avoid this in the future',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );
}
