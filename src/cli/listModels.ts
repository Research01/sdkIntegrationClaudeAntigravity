import { Command } from 'commander';
import { listModels } from '../anthropicClient.js';
import { handleAnthropicError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

export function registerModelsCommand(program: Command): void {
  program
    .command('models')
    .description('List available Claude models from the API')
    .action(async () => {
      try {
        logger.print('Fetching available models...\n');

        const models = await listModels();

        if (models.length === 0) {
          logger.print('No models found. This may be a permissions issue.');
          return;
        }

        // Table header
        logger.print('┌──────────────────────────────────────────┬────────────────────────────────┬──────────────────────┐');
        logger.print('│ Model ID                                 │ Display Name                   │ Created              │');
        logger.print('├──────────────────────────────────────────┼────────────────────────────────┼──────────────────────┤');

        for (const model of models) {
          const id = model.id.padEnd(40);
          const name = (model.displayName || '-').padEnd(30);
          const date = (model.createdAt || '-').substring(0, 20).padEnd(20);
          logger.print(`│ ${id} │ ${name} │ ${date} │`);
        }

        logger.print('└──────────────────────────────────────────┴────────────────────────────────┴──────────────────────┘');
        logger.print(`\nTotal: ${models.length} model(s)`);
      } catch (err) {
        const message = handleAnthropicError(err);
        logger.error(message);
        process.exit(1);
      }
    });
}
