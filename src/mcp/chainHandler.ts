/**
 * Chain Handler — v3.
 *
 * MCP tool: claude_chain
 * Executes a multi-step pipeline defined as a JSON chain spec.
 */

import { executeChain } from '../utils/toolChain.js';
import * as logger from '../utils/logger.js';
import type { ChainDefinition } from '../utils/toolChain.js';

export interface ClaudeChainInput {
  chain: string;    // JSON string or stringified ChainDefinition
  input?: string;   // Initial input to the chain
}

export async function handleClaudeChain(input: ClaudeChainInput): Promise<string> {
  if (!input.chain?.trim()) {
    return 'chain is required: provide a JSON chain definition string.';
  }

  let chainDef: ChainDefinition;
  try {
    chainDef = JSON.parse(input.chain) as ChainDefinition;
  } catch (err) {
    return `Invalid chain JSON: ${err instanceof Error ? err.message : String(err)}`;
  }

  if (!Array.isArray(chainDef.steps) || chainDef.steps.length === 0) {
    return 'Chain must have at least one step.';
  }

  logger.debug(`claude_chain: "${chainDef.name}", ${chainDef.steps.length} steps`);

  const stepLogs: string[] = [];

  const result = await executeChain(
    chainDef,
    input.input ?? '',
    (step, index, total) => {
      stepLogs.push(`Step ${index + 1}/${total} [${step.stepId}]: ${step.durationMs}ms, ${step.inputTokens}↑${step.outputTokens}↓ tokens`);
    }
  );

  const summary = [
    `Chain: ${result.chainName}`,
    `Steps: ${result.steps.length}`,
    `Duration: ${result.totalDurationMs}ms`,
    `Tokens: ${result.totalInputTokens}↑ ${result.totalOutputTokens}↓`,
    '',
    ...stepLogs,
  ].join('\n');

  return `${result.finalOutput}\n\n---\n${summary}`;
}
