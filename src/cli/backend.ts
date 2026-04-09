import { Command } from 'commander';
import {
  getActiveBackend,
  setBackend,
  formatBackendStatus,
  getConfigPath,
} from '../utils/backendManager.js';
import { isAntigravityAvailable } from '../providers/antigravityProvider.js';
import { resetProvider } from '../providers/providerFactory.js';
import * as logger from '../utils/logger.js';

export function registerBackendCommand(program: Command): void {

  // ── backend (show active) ────────────────────────────────────────
  program
    .command('backend')
    .description('Show the currently active AI backend')
    .action(() => {
      logger.print(formatBackendStatus());
      logger.print(`   Config file: ${getConfigPath()}`);
      logger.print('');
    });

  // ── use:claude ───────────────────────────────────────────────────
  program
    .command('use:claude')
    .description('Switch to Claude API (pay-as-you-go with ANTHROPIC_API_KEY)')
    .action(() => {
      const current = getActiveBackend();
      if (current === 'claude') {
        logger.print('\n🟣  Already using Claude API — no change needed.\n');
        return;
      }
      setBackend('claude');
      resetProvider();
      logger.print('');
      logger.print('✅  Switched to: Claude API (pay-as-you-go)');
      logger.print('   Requests will use your ANTHROPIC_API_KEY from .env');
      logger.print('   Token costs apply per request.');
      logger.print('');
      logger.print('   Run `npm run health` to verify connectivity.');
      logger.print('');
    });

  // ── use:antigravity ──────────────────────────────────────────────
  program
    .command('use:antigravity')
    .description('Switch to Antigravity backend (uses subscription via Antigravity CLI)')
    .action(() => {
      const current = getActiveBackend();
      if (current === 'antigravity') {
        logger.print('\n🟢  Already using Antigravity — no change needed.\n');
        return;
      }

      const available = isAntigravityAvailable();

      setBackend('antigravity');
      resetProvider();

      logger.print('');
      logger.print('✅  Switched to: Antigravity (subscription)');

      if (available) {
        logger.print('   🟢 Antigravity detected — requests will route through your subscription.');
      } else {
        logger.print('   ⚠️  Antigravity binary not found in PATH.');
        logger.print('   Requests will fall back to Claude API until Antigravity is installed.');
        logger.print('   Install: https://developers.google.com/gemini/antigravity');
      }

      logger.print('');
      logger.print('   No per-request API costs while Antigravity handles the calls.');
      logger.print('   Run `npm run backend` to see current status.');
      logger.print('');
    });
}
