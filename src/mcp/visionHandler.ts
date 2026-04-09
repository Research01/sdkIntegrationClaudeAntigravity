/**
 * Vision Handler — v3.
 *
 * MCP tool: claude_vision
 * Accepts an image (file path or URL) and a prompt, returns Claude's analysis.
 */

import { getProvider } from '../providers/providerFactory.js';
import { handleAnthropicError } from '../utils/errors.js';
import { calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import * as logger from '../utils/logger.js';
import type { ImageSource } from '../providers/aiProvider.js';

export interface ClaudeVisionInput {
  image_path?: string;
  image_url?: string;
  prompt: string;
  system?: string;
  model?: string;
  max_tokens?: number;
}

/**
 * Handler for claude_vision MCP tool.
 */
export async function handleClaudeVision(input: ClaudeVisionInput): Promise<string> {
  if (!input.image_path && !input.image_url) {
    throw new Error('Either image_path or image_url is required.');
  }
  if (!input.prompt?.trim()) {
    throw new Error('prompt is required and must be non-empty.');
  }

  const src: ImageSource = input.image_url
    ? { type: 'url', value: input.image_url }
    : { type: 'file', value: input.image_path! };

  logger.debug(`claude_vision: src=${src.type}:${src.value.slice(0, 60)}, prompt length=${input.prompt.length}`);

  const provider = getProvider();

  const response = await provider.askWithImage(src, input.prompt, {
    system: input.system,
    model: input.model,
    maxTokens: input.max_tokens,
  });

  const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
  const meta = `Model: ${response.model} | Tokens: ${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ | Cost: ${formatActualCostShort(costUsd)}`;

  return `${response.content}\n\n---\n${meta}`;
}
