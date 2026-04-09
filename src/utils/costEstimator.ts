/**
 * Token Cost Estimator — v2 feature.
 *
 * Provides price-per-token data for known Claude models and estimates
 * request cost before sending to the API. Token count uses a heuristic
 * (~4 chars per token) since tiktoken is not available for Claude.
 *
 * Prices are in USD per million tokens (MTok) as of April 2025.
 * Source: https://www.anthropic.com/pricing
 */

import type { TokenCostEstimate } from '../types.js';

// ── Pricing table (USD per million tokens) ────────────────────────

interface ModelPricing {
  inputMtok: number;   // $ per 1M input tokens
  outputMtok: number;  // $ per 1M output tokens
}

const PRICING: Record<string, ModelPricing> = {
  // Claude 4 family
  'claude-opus-4-20250514':   { inputMtok: 15.00, outputMtok: 75.00 },
  'claude-sonnet-4-20250514': { inputMtok:  3.00, outputMtok: 15.00 },
  'claude-haiku-4-20250514':  { inputMtok:  0.80, outputMtok:  4.00 },

  // Claude 3.7 family
  'claude-sonnet-3-7-20250219': { inputMtok: 3.00, outputMtok: 15.00 },

  // Claude 3.5 family
  'claude-opus-3-5-20241022':   { inputMtok: 15.00, outputMtok: 75.00 },
  'claude-sonnet-3-5-20241022': { inputMtok:  3.00, outputMtok: 15.00 },
  'claude-haiku-3-5-20241022':  { inputMtok:  0.80, outputMtok:  4.00 },

  // Claude 3 family
  'claude-opus-3-20240229':   { inputMtok: 15.00, outputMtok: 75.00 },
  'claude-sonnet-3-20240229': { inputMtok:  3.00, outputMtok: 15.00 },
  'claude-haiku-3-20240307':  { inputMtok:  0.25, outputMtok:  1.25 },
};

/** Fallback pricing (sonnet tier) for unknown/future models */
const FALLBACK_PRICING: ModelPricing = { inputMtok: 3.00, outputMtok: 15.00 };

// ── Token counting heuristic ──────────────────────────────────────

/**
 * Rough token count estimate: ~4 characters per token on average.
 * Claude uses a BPE tokenizer; this is a conservative approximation.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// ── Cost calculation ──────────────────────────────────────────────

/**
 * Get pricing for a model. Falls back to sonnet-tier pricing for unknowns.
 */
export function getPricing(modelId: string): ModelPricing {
  // Exact match
  if (PRICING[modelId]) return PRICING[modelId];

  // Partial match: find by prefix (e.g. "claude-opus-4" → opus tier)
  const lc = modelId.toLowerCase();
  if (lc.includes('opus'))   return { inputMtok: 15.00, outputMtok: 75.00 };
  if (lc.includes('haiku'))  return { inputMtok:  0.80, outputMtok:  4.00 };
  if (lc.includes('sonnet')) return { inputMtok:  3.00, outputMtok: 15.00 };

  return FALLBACK_PRICING;
}

/**
 * Estimate the cost of a request before sending it to the API.
 *
 * @param modelId - The model that will be used
 * @param prompt - The user prompt
 * @param system - Optional system prompt
 * @param expectedOutputTokens - Expected output size (default: 1024)
 */
export function estimateCost(
  modelId: string,
  prompt: string,
  system?: string,
  expectedOutputTokens = 1024,
): TokenCostEstimate {
  const pricing = getPricing(modelId);

  const inputText = [system, prompt].filter(Boolean).join('\n');
  const estimatedInputTokens = estimateTokenCount(inputText);
  const estimatedOutputTokens = expectedOutputTokens;

  const inputCostUsd  = (estimatedInputTokens  / 1_000_000) * pricing.inputMtok;
  const outputCostUsd = (estimatedOutputTokens / 1_000_000) * pricing.outputMtok;

  return {
    model: modelId,
    estimatedInputTokens,
    estimatedOutputTokens,
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    pricePerInputMtok: pricing.inputMtok,
    pricePerOutputMtok: pricing.outputMtok,
  };
}

/**
 * Calculate the actual cost from a completed API response.
 */
export function calculateActualCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = getPricing(modelId);
  return (inputTokens / 1_000_000) * pricing.inputMtok
       + (outputTokens / 1_000_000) * pricing.outputMtok;
}

/**
 * Format a cost estimate as a human-readable string.
 */
export function formatCostEstimate(estimate: TokenCostEstimate): string {
  const usd = (n: number) => `$${n.toFixed(6)}`;
  return [
    `Model:           ${estimate.model}`,
    `Input tokens:    ~${estimate.estimatedInputTokens.toLocaleString()} (${usd(estimate.inputCostUsd)})`,
    `Output tokens:   ~${estimate.estimatedOutputTokens.toLocaleString()} (${usd(estimate.outputCostUsd)})`,
    `Estimated cost:  ${usd(estimate.totalCostUsd)}`,
    `Pricing:         $${estimate.pricePerInputMtok}/MTok in | $${estimate.pricePerOutputMtok}/MTok out`,
  ].join('\n');
}

/**
 * Format actual cost as a short string for inline display.
 */
export function formatActualCostShort(costUsd: number): string {
  if (costUsd < 0.000001) return '<$0.000001';
  return `$${costUsd.toFixed(6)}`;
}
