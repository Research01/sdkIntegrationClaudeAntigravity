import { Command } from 'commander';
import { healthCheck } from '../anthropicClient.js';
import * as logger from '../utils/logger.js';

export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check API configuration and connectivity')
    .action(async () => {
      logger.print('Checking Claude API health...\n');

      const result = await healthCheck();

      if (result.status === 'ok') {
        logger.print('✅ Status:          OK');
        logger.print(`📦 Model:           ${result.model}`);
        logger.print(`🔑 API Key:         Configured`);
        logger.print(`🌐 API Reachable:   Yes`);
        logger.print(`⏱️  Latency:         ${result.latencyMs}ms`);
      } else {
        logger.print('❌ Status:          ERROR');
        logger.print(`📦 Model:           ${result.model}`);
        logger.print(`🔑 API Key:         ${result.apiKeyConfigured ? 'Configured' : 'MISSING'}`);
        logger.print(`🌐 API Reachable:   ${result.apiReachable ? 'Yes' : 'No'}`);
        logger.print(`⏱️  Latency:         ${result.latencyMs}ms`);
        if (result.error) {
          logger.print(`\n🔍 Error: ${result.error}`);
        }
        process.exit(1);
      }
    });
}
