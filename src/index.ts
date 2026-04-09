#!/usr/bin/env node

import { Command } from 'commander';
import { registerAskCommand } from './cli/ask.js';
import { registerChatCommand } from './cli/chat.js';
import { registerHealthCommand } from './cli/health.js';
import { registerModelsCommand } from './cli/listModels.js';
import { setVerbose } from './utils/logger.js';

const program = new Command();

program
  .name('claude-cli')
  .description('Claude pay-as-you-go CLI — interact with Claude API directly')
  .version('1.0.0')
  .option('-v, --verbose', 'Enable verbose/debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
    }
  });

registerAskCommand(program);
registerChatCommand(program);
registerHealthCommand(program);
registerModelsCommand(program);

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
