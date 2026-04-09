/**
 * Tool Chain Engine — v3.
 *
 * Executes a pipeline of AI tool calls where the output of each step
 * can be used as the input of the next.
 *
 * Chain definition format (JSON):
 * {
 *   "name": "My Pipeline",
 *   "description": "Optional description",
 *   "steps": [
 *     {
 *       "id": "step1",
 *       "tool": "ask",
 *       "prompt": "Summarize this: {{input}}",
 *       "system": "Be concise."
 *     },
 *     {
 *       "id": "step2",
 *       "tool": "ask",
 *       "prompt": "Translate to Spanish: {{step1}}"
 *     }
 *   ]
 * }
 *
 * Template variables:
 *   {{input}}     → the initial input provided to the chain
 *   {{prev}}      → output of the immediately preceding step
 *   {{stepId}}    → output of the step with that ID
 */

import { readFileSync } from 'fs';
import { getProvider } from '../providers/providerFactory.js';
import * as logger from '../utils/logger.js';

// ── Chain definition types ────────────────────────────────────────

export type ChainToolType = 'ask' | 'vision';

export interface ChainStep {
  id: string;
  tool: ChainToolType;
  prompt: string;
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** For vision steps — path or URL to image */
  imagePath?: string;
}

export interface ChainDefinition {
  name: string;
  description?: string;
  steps: ChainStep[];
}

// ── Result types ──────────────────────────────────────────────────

export interface StepResult {
  stepId: string;
  tool: ChainToolType;
  output: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}

export interface ChainResult {
  chainName: string;
  finalOutput: string;
  steps: StepResult[];
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
}

// ── Template interpolation ────────────────────────────────────────

function interpolate(template: string, context: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (key in context) return context[key];
    return `{{${key}}}`;  // Leave unresolved variables as-is
  });
}

// ── Executor ──────────────────────────────────────────────────────

/**
 * Execute a chain definition with an initial input string.
 */
export async function executeChain(
  chain: ChainDefinition,
  input: string,
  onStepComplete?: (step: StepResult, index: number, total: number) => void,
): Promise<ChainResult> {
  const provider = getProvider();
  const context: Record<string, string> = { input };
  const results: StepResult[] = [];
  const chainStart = Date.now();
  let prev = input;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    const stepStart = Date.now();

    logger.debug(`Chain step ${i + 1}/${chain.steps.length}: ${step.id} (${step.tool})`);

    // Resolve template in prompt
    const prompt = interpolate(step.prompt, { ...context, prev });

    let output = '';
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      if (step.tool === 'vision' && step.imagePath) {
        const imageType = step.imagePath.startsWith('http') ? 'url' : 'file';
        const response = await provider.askWithImage(
          { type: imageType, value: step.imagePath },
          prompt,
          { system: step.system, model: step.model, maxTokens: step.maxTokens, temperature: step.temperature }
        );
        output = response.content;
        inputTokens = response.usage.inputTokens;
        outputTokens = response.usage.outputTokens;
      } else {
        const response = await provider.ask({
          prompt,
          system: step.system,
          model: step.model,
          maxTokens: step.maxTokens,
          temperature: step.temperature,
        });
        output = response.content;
        inputTokens = response.usage.inputTokens;
        outputTokens = response.usage.outputTokens;
      }
    } catch (err) {
      throw new Error(`Chain step "${step.id}" failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    const stepResult: StepResult = {
      stepId: step.id,
      tool: step.tool,
      output,
      durationMs: Date.now() - stepStart,
      inputTokens,
      outputTokens,
    };

    results.push(stepResult);
    context[step.id] = output;
    prev = output;

    onStepComplete?.(stepResult, i, chain.steps.length);
  }

  const totalInputTokens  = results.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutputTokens = results.reduce((s, r) => s + r.outputTokens, 0);

  return {
    chainName: chain.name,
    finalOutput: prev,
    steps: results,
    totalDurationMs: Date.now() - chainStart,
    totalInputTokens,
    totalOutputTokens,
  };
}

/**
 * Load a chain definition from a JSON file path.
 */
export function loadChainFile(filePath: string): ChainDefinition {
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as ChainDefinition;
  } catch (err) {
    throw new Error(`Failed to load chain file "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
