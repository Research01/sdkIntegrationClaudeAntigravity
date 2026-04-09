import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { executeChain } from '../utils/toolChain.js';
import { calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import { handleAnthropicError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import type { ChainDefinition } from '../utils/toolChain.js';

export function registerChainCommand(program: Command): void {
  program
    .command('chain')
    .description('Execute a JSON-defined chain of Claude tool calls')
    .argument('<file>', 'Path to chain definition JSON file')
    .argument('[input]', 'Initial input to the chain', '')
    .option('--input-file <path>', 'Read initial input from a file instead of argument')
    .option('-v, --verbose', 'Show each step output as it completes')
    .action(async (file: string, inputArg: string, options: Record<string, string | boolean | undefined>) => {
      const filePath = resolve(process.cwd(), file);

      if (!existsSync(filePath)) {
        logger.error(`Chain file not found: ${filePath}`);
        process.exit(1);
      }

      // Load chain definition
      let chain: ChainDefinition;
      try {
        const raw = readFileSync(filePath, 'utf-8');
        chain = JSON.parse(raw) as ChainDefinition;
      } catch (err) {
        logger.error(`Failed to parse chain file: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      // Load initial input
      let input = inputArg;
      if (options.inputFile) {
        const inputFilePath = resolve(process.cwd(), options.inputFile as string);
        if (!existsSync(inputFilePath)) {
          logger.error(`Input file not found: ${inputFilePath}`);
          process.exit(1);
        }
        input = readFileSync(inputFilePath, 'utf-8');
      }

      const verbose = options.verbose === true;

      logger.print('');
      logger.print(`⛓️  Chain: ${chain.name}`);
      if (chain.description) logger.print(`   ${chain.description}`);
      logger.print(`   Steps: ${chain.steps.length}`);
      logger.print('');

      try {
        const result = await executeChain(
          chain,
          input,
          (step, index, total) => {
            logger.print(`   ✅ Step ${index + 1}/${total} [${step.stepId}] — ${step.durationMs}ms`);
            if (verbose) {
              logger.print('');
              logger.print(`   Output: ${step.output.slice(0, 300)}${step.output.length > 300 ? '…' : ''}`);
              logger.print('');
            }
          }
        );

        logger.print('');
        logger.print('── Final Output ────────────────────────────────────────');
        logger.print('');
        logger.print(result.finalOutput);
        logger.print('');

        const totalCost = (result.totalInputTokens + result.totalOutputTokens);
        logger.print(`── Summary ─────────────────────────────────────────────`);
        logger.print(`   Steps:          ${result.steps.length}`);
        logger.print(`   Total duration: ${result.totalDurationMs}ms`);
        logger.print(`   Total tokens:   ${result.totalInputTokens}↑ ${result.totalOutputTokens}↓`);
        logger.print('');
      } catch (err) {
        const message = err instanceof Error ? err.message : handleAnthropicError(err);
        logger.error(`\nChain failed: ${message}\n`);
        process.exit(1);
      }
    });
}
