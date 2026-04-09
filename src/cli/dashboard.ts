import { Command } from 'commander';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { aggregateMetrics } from '../analytics/aggregator.js';
import { getCacheStats } from '../utils/responseCache.js';
import { getActiveBackend, getBackendConfig } from '../utils/backendManager.js';
import * as logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const DEFAULT_PORT = 4321;

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Start local analytics dashboard at http://localhost:4321')
    .option('-p, --port <number>', 'Port to listen on', String(DEFAULT_PORT))
    .option('--no-open', 'Do not open browser automatically')
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const port   = parseInt(options.port as string || String(DEFAULT_PORT), 10);
      const doOpen = options.open !== false;

      const server = createServer((req, res) => {
        const url = req.url || '/';

        // ── API: /api/metrics ──────────────────────────────────────
        if (url === '/api/metrics') {
          try {
            const metrics  = aggregateMetrics();
            const cache    = getCacheStats();
            const backend  = getActiveBackend();
            const bConfig  = getBackendConfig();

            res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ metrics, cache, backend, backendSwitchedAt: bConfig.switchedAt }));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
          }
          return;
        }

        // ── Serve dashboard HTML ───────────────────────────────────
        // Look in src/dashboard/ relative to this file
        const dashboardPath = resolve(__dirname, '..', '..', 'src', 'dashboard', 'index.html');
        const distDashboardPath = resolve(__dirname, '..', 'dashboard', 'index.html');

        const htmlPath = existsSync(distDashboardPath) ? distDashboardPath
          : existsSync(dashboardPath) ? dashboardPath
          : null;

        if (htmlPath) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(readFileSync(htmlPath, 'utf-8'));
        } else {
          res.writeHead(404);
          res.end('Dashboard HTML not found. Run: npm run build');
        }
      });

      server.listen(port, '127.0.0.1', () => {
        const url = `http://localhost:${port}`;
        logger.print('');
        logger.print('📊 Analytics Dashboard');
        logger.print(`   Running at: ${url}`);
        logger.print('   Press Ctrl+C to stop.');
        logger.print('');

        if (doOpen) {
          try {
            // macOS
            execSync(`open "${url}"`, { stdio: 'ignore' });
          } catch {
            try {
              // Linux
              execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
            } catch {
              logger.print(`   Open your browser at: ${url}`);
            }
          }
        }
      });

      // Keep process alive
      process.on('SIGINT', () => {
        logger.print('\n\nDashboard stopped. Goodbye!\n');
        server.close();
        process.exit(0);
      });
    });
}
