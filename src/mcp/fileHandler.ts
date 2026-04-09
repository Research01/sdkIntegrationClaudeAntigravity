/**
 * File Handler — v3.
 *
 * MCP tools:
 *   claude_analyze_file     — read + analyze a single file
 *   claude_process_files    — batch analyze multiple files in one request
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { resolve, basename } from 'path';
import { getProvider } from '../providers/providerFactory.js';
import { calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import * as logger from '../utils/logger.js';

const MAX_FILE_SIZE_BYTES = 200_000; // 200 KB per file
const MAX_FILES = 10;

// ── Single file analysis ──────────────────────────────────────────

export interface ClaudeAnalyzeFileInput {
  file_path: string;
  prompt?: string;
  system?: string;
  model?: string;
  max_tokens?: number;
}

export async function handleClaudeAnalyzeFile(input: ClaudeAnalyzeFileInput): Promise<string> {
  const filePath = resolve(input.file_path);

  if (!existsSync(filePath)) {
    return `File not found: ${filePath}`;
  }

  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return `File too large: ${(stat.size / 1024).toFixed(1)} KB (max ${MAX_FILE_SIZE_BYTES / 1024} KB)`;
  }

  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return `Cannot read file (may be binary): ${filePath}`;
  }

  const prompt = input.prompt
    || `Analyze the following file and explain what it does, its structure, and any notable patterns or issues.\n\nFile: ${basename(filePath)}\n\n\`\`\`\n${content}\n\`\`\``;

  logger.debug(`claude_analyze_file: ${filePath} (${stat.size} bytes)`);

  const provider = getProvider();
  const response = await provider.ask({ prompt, system: input.system, model: input.model, maxTokens: input.max_tokens });

  const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
  const meta = `Model: ${response.model} | Tokens: ${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ | Cost: ${formatActualCostShort(costUsd)}`;

  return `${response.content}\n\n---\n${meta}`;
}

// ── Multi-file batch processing ───────────────────────────────────

export interface ClaudeProcessFilesInput {
  file_paths: string[];
  prompt?: string;
  system?: string;
  model?: string;
  max_tokens?: number;
}

export async function handleClaudeProcessFiles(input: ClaudeProcessFilesInput): Promise<string> {
  if (!Array.isArray(input.file_paths) || input.file_paths.length === 0) {
    return 'file_paths must be a non-empty array.';
  }
  if (input.file_paths.length > MAX_FILES) {
    return `Too many files: ${input.file_paths.length} (max ${MAX_FILES})`;
  }

  const fileBlocks: string[] = [];

  for (const rawPath of input.file_paths) {
    const filePath = resolve(rawPath);

    if (!existsSync(filePath)) {
      fileBlocks.push(`### ${basename(filePath)}\n[File not found: ${filePath}]`);
      continue;
    }

    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      fileBlocks.push(`### ${basename(filePath)}\n[File too large: ${(stat.size / 1024).toFixed(1)} KB]`);
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      fileBlocks.push(`### ${basename(filePath)}\n\`\`\`\n${content}\n\`\`\``);
    } catch {
      fileBlocks.push(`### ${basename(filePath)}\n[Cannot read file]`);
    }
  }

  const filesBlock = fileBlocks.join('\n\n');
  const prompt = input.prompt
    ? `${input.prompt}\n\n${filesBlock}`
    : `Analyze the following files as a group. Explain what each does, how they relate to each other, and any notable patterns or issues.\n\n${filesBlock}`;

  logger.debug(`claude_process_files: ${input.file_paths.length} files`);

  const provider = getProvider();
  const response = await provider.ask({ prompt, system: input.system, model: input.model, maxTokens: input.max_tokens });

  const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
  const meta = `Model: ${response.model} | Tokens: ${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ | Cost: ${formatActualCostShort(costUsd)} | Files: ${input.file_paths.length}`;

  return `${response.content}\n\n---\n${meta}`;
}
