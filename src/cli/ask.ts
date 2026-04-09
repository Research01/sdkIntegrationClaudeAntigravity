import { Command } from 'commander';
import { ask, askStream } from '../anthropicClient.js';
import { handleAnthropicError } from '../utils/errors.js';
import { estimateCost, formatCostEstimate, calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import { getConfig } from '../anthropicClient.js';
import * as logger from '../utils/logger.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask')
    .description('Send a single prompt to Claude and get a response')
    .argument('<prompt>', 'The prompt to send')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --max-tokens <number>', 'Maximum tokens for the response')
    .option('--temperature <number>', 'Temperature (0.0–1.0)')
    .option('-s, --system <prompt>', 'System prompt')
    .option('-S, --stream', 'Stream the response in real time')
    .option('-e, --estimate-cost', 'Show cost estimate before sending')
    .option('-v, --verbose', 'Show debug info')
    .action(async (prompt: string, options: Record<string, string | boolean | undefined>) => {
      const model   = options.model as string | undefined;
      const maxTokens = options.maxTokens ? parseInt(options.maxTokens as string, 10) : undefined;
      const temperature = options.temperature ? parseFloat(options.temperature as string) : undefined;
      const system  = options.system as string | undefined;
      const stream  = options.stream === true;
      const showEst = options.estimateCost === true;

      // Resolve effective model for cost display
      let effectiveModel: string;
      try {
        effectiveModel = model || getConfig().model;
      } catch {
        effectiveModel = 'claude-sonnet-4-20250514';
      }

      // ── Cost estimation ──────────────────────────────────────────
      if (showEst) {
        const estimate = estimateCost(
          effectiveModel,
          prompt,
          system,
          maxTokens ?? 1024,
        );
        logger.print('');
        logger.print('── Cost Estimate ──────────────────────────────────────');
        logger.print(formatCostEstimate(estimate));
        logger.print('───────────────────────────────────────────────────────');
        logger.print('');
      }

      try {
        if (stream) {
          // ── Streaming mode ─────────────────────────────────────
          logger.print('');
          process.stdout.write('Claude > ');
          let totalContent = '';

          const response = await askStream({
            prompt,
            system,
            model,
            maxTokens,
            temperature,
            onChunk: (chunk) => {
              process.stdout.write(chunk);
              totalContent += chunk;
            },
          });

          process.stdout.write('\n');
          logger.print('');

          const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
          logger.print(
            `  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens | ` +
            `${formatActualCostShort(costUsd)} | ${response.model}]`
          );
          logger.print('');
        } else {
          // ── Non-streaming mode ─────────────────────────────────
          const response = await ask({ prompt, system, model, maxTokens, temperature });
          logger.print('');
          logger.print(response.content);
          logger.print('');

          const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
          logger.print(
            `  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens | ` +
            `${formatActualCostShort(costUsd)} | ${response.model}]`
          );
          logger.print('');
        }
      } catch (err) {
        const message = handleAnthropicError(err);
        logger.error(`\nError: ${message}\n`);
        process.exit(1);
      }
    });
}
