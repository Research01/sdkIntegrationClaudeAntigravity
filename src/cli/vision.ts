import { Command } from 'commander';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { getProvider } from '../providers/providerFactory.js';
import { handleAnthropicError } from '../utils/errors.js';
import { calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import { getActiveBackend } from '../utils/backendManager.js';
import * as logger from '../utils/logger.js';
import type { ImageSource } from '../providers/aiProvider.js';

export function registerVisionCommand(program: Command): void {
  program
    .command('vision')
    .description('Analyze an image with Claude Vision — pass a file path or URL')
    .argument('<image>', 'Local file path or URL of the image to analyze')
    .argument('[prompt]', 'What to ask about the image', 'Describe this image in detail.')
    .option('-m, --model <model>', 'Model to use (must support vision)')
    .option('-t, --max-tokens <number>', 'Maximum tokens for the response')
    .option('--temperature <number>', 'Temperature (0.0–1.0)')
    .option('-s, --system <prompt>', 'System prompt')
    .option('-S, --stream', 'Stream the response in real time')
    .action(async (image: string, prompt: string, options: Record<string, string | boolean | undefined>) => {
      const model       = options.model as string | undefined;
      const maxTokens   = options.maxTokens ? parseInt(options.maxTokens as string, 10) : undefined;
      const temperature = options.temperature ? parseFloat(options.temperature as string) : undefined;
      const system      = options.system as string | undefined;
      const doStream    = options.stream === true;

      // Determine image source type
      const isUrl = image.startsWith('http://') || image.startsWith('https://');
      const src: ImageSource = isUrl
        ? { type: 'url', value: image }
        : { type: 'file', value: resolve(process.cwd(), image) };

      // Validate local file
      if (src.type === 'file' && !existsSync(src.value)) {
        logger.error(`Image file not found: ${src.value}`);
        process.exit(1);
      }

      const provider = getProvider();
      const backend  = getActiveBackend();

      logger.print('');
      logger.print(`🔍 Vision analysis — backend: ${backend}`);
      logger.print(`   Image: ${image}`);
      logger.print(`   Prompt: ${prompt}`);
      logger.print('');

      try {
        if (doStream) {
          process.stdout.write('Claude > ');
          let finalContent = '';

          // Stream is simulated for vision (Anthropic vision doesn't support streaming natively in all versions)
          const response = await provider.askWithImage(src, prompt, { system, model, maxTokens, temperature });
          finalContent = response.content;

          // Print word-by-word to simulate streaming feel
          const words = finalContent.split(' ');
          for (const word of words) {
            process.stdout.write(word + ' ');
            await new Promise((r) => setTimeout(r, 10));
          }
          process.stdout.write('\n\n');

          const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
          logger.print(`  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens | ${formatActualCostShort(costUsd)} | ${response.model}]`);
        } else {
          const response = await provider.askWithImage(src, prompt, { system, model, maxTokens, temperature });

          logger.print(`Claude > ${response.content}`);
          logger.print('');

          const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);
          logger.print(`  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens | ${formatActualCostShort(costUsd)} | ${response.model}]`);
        }

        logger.print('');
      } catch (err) {
        const message = handleAnthropicError(err);
        logger.error(`\nVision error: ${message}\n`);
        process.exit(1);
      }
    });
}
