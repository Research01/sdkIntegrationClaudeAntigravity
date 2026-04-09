import { Command } from 'commander';
import { ask } from '../anthropicClient.js';
import { handleAnthropicError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import { validatePrompt, validateModel, validateMaxTokens, validateTemperature, validateSystem } from '../utils/validation.js';

export function registerAskCommand(program: Command): void {
  program
    .command('ask <prompt>')
    .description('Send a single prompt to Claude and get a response')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --max-tokens <number>', 'Maximum tokens for response')
    .option('--temperature <number>', 'Temperature (0.0–1.0)')
    .option('-s, --system <prompt>', 'System prompt')
    .action(async (promptArg: string, options: Record<string, string | undefined>) => {
      try {
        const prompt = validatePrompt(promptArg);
        const model = validateModel(options.model);
        const maxTokens = validateMaxTokens(options.maxTokens);
        const temperature = validateTemperature(options.temperature);
        const system = validateSystem(options.system);

        logger.debug(`Ask: model=${model || 'default'}, maxTokens=${maxTokens || 'default'}`);

        const response = await ask({ prompt, system, model, maxTokens, temperature });

        logger.print(response.content);
        logger.print('');
        logger.print(`── model: ${response.model} | tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out | stop: ${response.stopReason} ──`);
      } catch (err) {
        const message = handleAnthropicError(err);
        logger.error(message);
        process.exit(1);
      }
    });
}
