#!/usr/bin/env node

import { Command } from 'commander';
import { registerAskCommand } from './cli/ask.js';
import { registerChatCommand } from './cli/chat.js';
import { registerHealthCommand } from './cli/health.js';
import { registerModelsCommand } from './cli/listModels.js';
import { registerBackendCommand } from './cli/backend.js';
import { registerVisionCommand } from './cli/vision.js';
import { registerChainCommand } from './cli/chain.js';
import { registerDashboardCommand } from './cli/dashboard.js';
import { setVerbose } from './utils/logger.js';
import { getCacheStats, clearCache, pruneExpiredCache, formatCacheStats } from './utils/responseCache.js';
import * as logger from './utils/logger.js';

const program = new Command();

program
  .name('claude-cli')
  .description('Claude Integration CLI — pay-as-you-go or Antigravity subscription')
  .version('3.0.0')
  .option('-v, --verbose', 'Enable verbose/debug output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) setVerbose(true);
  });

// ── v1 commands ────────────────────────────────────────────────────
registerAskCommand(program);
registerChatCommand(program);
registerHealthCommand(program);
registerModelsCommand(program);

// ── v2/v3 commands ─────────────────────────────────────────────────
registerBackendCommand(program);
registerVisionCommand(program);
registerChainCommand(program);
registerDashboardCommand(program);

// ── Cache management commands ──────────────────────────────────────
program
  .command('cache:stats')
  .description('Show response cache statistics')
  .action(() => {
    logger.print('');
    logger.print('── Cache Statistics ─────────────────────────────────────');
    logger.print(formatCacheStats(getCacheStats()));
    logger.print('');
  });

program
  .command('cache:clear')
  .description('Delete all cached responses')
  .action(() => {
    const count = clearCache();
    logger.print(`\n🗑️  Cleared ${count} cache entries.\n`);
  });

program
  .command('cache:prune')
  .description('Delete only expired cache entries')
  .action(() => {
    const count = pruneExpiredCache();
    logger.print(`\n✂️  Pruned ${count} expired cache entries.\n`);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`Fatal error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
