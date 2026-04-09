import { Command } from 'commander';
import { createInterface } from 'readline';
import { chat, chatStream } from '../anthropicClient.js';
import { getConfig } from '../anthropicClient.js';
import { handleAnthropicError } from '../utils/errors.js';
import { calculateActualCost, estimateCost, formatCostEstimate, formatActualCostShort } from '../utils/costEstimator.js';
import {
  createSession,
  loadSessionByName,
  loadSession,
  saveSession,
  listSessions,
  appendUserMessage,
  appendAssistantMessage,
  formatSessionList,
  getStoreDir,
} from '../utils/conversationStore.js';
import * as logger from '../utils/logger.js';
import type { ChatMessage, ConversationSession } from '../types.js';

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start an interactive multi-turn conversation with Claude')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --max-tokens <number>', 'Maximum tokens per response')
    .option('--temperature <number>', 'Temperature (0.0–1.0)')
    .option('-s, --system <prompt>', 'System prompt')
    .option('-S, --stream', 'Stream responses in real time')
    .option('--session <name>', 'Load or create a named persistent session')
    .option('--estimate-cost', 'Show cost estimate before each request')
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const model       = options.model as string | undefined;
      const maxTokens   = options.maxTokens ? parseInt(options.maxTokens as string, 10) : undefined;
      const temperature = options.temperature ? parseFloat(options.temperature as string) : undefined;
      const system      = options.system as string | undefined;
      const stream      = options.stream === true;
      const showEst     = options.estimateCost === true;
      const sessionName = options.session as string | undefined;

      // Resolve effective model for cost calculation
      let effectiveModel: string;
      try {
        effectiveModel = model || getConfig().model;
      } catch {
        effectiveModel = 'claude-sonnet-4-20250514';
      }

      // ── Session setup ──────────────────────────────────────────
      let session: ConversationSession | null = null;
      let history: ChatMessage[] = [];

      if (sessionName) {
        session = loadSessionByName(sessionName);
        if (session) {
          history = [...session.messages];
          logger.print(`\n📂 Loaded session: "${session.name}" (${session.metadata.turnCount} turns, $${session.metadata.totalCostUsd.toFixed(4)} spent)\n`);
        } else {
          session = createSession(sessionName, { model, system });
          logger.print(`\n✨ Created new session: "${sessionName}"\n`);
        }
      }

      // ── Header ─────────────────────────────────────────────────
      logger.print('╔══════════════════════════════════════════════════════╗');
      logger.print('║   Claude Interactive Chat  — v2                      ║');
      logger.print('║   /quit /clear /help /save <n> /load <n> /sessions   ║');
      logger.print('╚══════════════════════════════════════════════════════╝');
      if (stream) logger.print('  ⚡ Streaming mode enabled');
      if (session) logger.print(`  📁 Session: ${session.name} [${session.id.slice(0, 8)}]`);
      logger.print('');

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const promptUser = (): void => {
        rl.question('You > ', async (input: string) => {
          const trimmed = input.trim();

          if (!trimmed) { promptUser(); return; }

          // ── Built-in commands ────────────────────────────────────
          if (trimmed === '/quit' || trimmed === '/exit') {
            if (session) { saveSession(session); logger.print(`\n💾 Session saved: "${session.name}"`); }
            logger.print('\nGoodbye! 👋');
            rl.close();
            return;
          }

          if (trimmed === '/clear') {
            history.length = 0;
            if (session) { session.messages = []; saveSession(session); }
            logger.print('── Conversation cleared ──');
            promptUser();
            return;
          }

          if (trimmed === '/help') {
            logger.print('');
            logger.print('Commands:');
            logger.print('  /quit              - Exit (auto-saves session)');
            logger.print('  /clear             - Clear conversation history');
            logger.print('  /save <name>       - Save current session with a name');
            logger.print('  /load <name|id>    - Load a session by name or ID prefix');
            logger.print('  /sessions          - List all saved sessions');
            logger.print('  /help              - Show this help');
            logger.print(`\n  Sessions stored in: ${getStoreDir()}`);
            logger.print('');
            promptUser();
            return;
          }

          // /save <name>
          if (trimmed.startsWith('/save ')) {
            const name = trimmed.slice(6).trim();
            if (!name) { logger.print('Usage: /save <session-name>'); promptUser(); return; }
            if (!session) {
              session = createSession(name, { model, system });
              session.messages = [...history];
            } else {
              session.name = name;
              session.messages = [...history];
            }
            saveSession(session);
            logger.print(`💾 Session saved as "${name}" [${session.id.slice(0, 8)}]`);
            promptUser();
            return;
          }

          // /load <name or id-prefix>
          if (trimmed.startsWith('/load ')) {
            const nameOrId = trimmed.slice(6).trim();
            if (!nameOrId) { logger.print('Usage: /load <name-or-id>'); promptUser(); return; }
            const loaded = loadSessionByName(nameOrId) || loadSession(nameOrId);
            if (!loaded) { logger.print(`❌ Session not found: "${nameOrId}"`); promptUser(); return; }
            session = loaded;
            history = [...session.messages];
            logger.print(`📂 Loaded: "${session.name}" (${session.metadata.turnCount} turns)`);
            promptUser();
            return;
          }

          // /sessions
          if (trimmed === '/sessions') {
            logger.print('');
            logger.print(formatSessionList(listSessions()));
            logger.print('');
            promptUser();
            return;
          }

          // ── Cost estimation (optional) ────────────────────────────
          if (showEst) {
            const all = [...history, { role: 'user' as const, content: trimmed }];
            const combinedPrompt = all.map((m) => `${m.role}: ${m.content}`).join('\n');
            const est = estimateCost(effectiveModel, combinedPrompt, system, maxTokens ?? 1024);
            logger.print(`  💰 Est. cost: ${formatActualCostShort(est.totalCostUsd)}`);
          }

          // ── Append user message ────────────────────────────────────
          history.push({ role: 'user', content: trimmed });
          if (session) appendUserMessage(session, trimmed);

          try {
            let response;

            if (stream) {
              // Streaming mode
              logger.print('');
              process.stdout.write('Claude > ');

              response = await chatStream(
                history,
                (chunk) => process.stdout.write(chunk),
                { system, model, maxTokens, temperature }
              );
              process.stdout.write('\n');
            } else {
              // Non-streaming mode
              response = await chat(history, { system, model, maxTokens, temperature });
              logger.print('');
              logger.print(`Claude > ${response.content}`);
            }

            history.push({ role: 'assistant', content: response.content });

            const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);

            if (session) {
              appendAssistantMessage(
                session,
                response.content,
                response.usage.inputTokens,
                response.usage.outputTokens,
                costUsd,
              );
              saveSession(session);
            }

            logger.print('');
            logger.print(
              `  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens | ` +
              `${formatActualCostShort(costUsd)} | session total: $${session?.metadata.totalCostUsd.toFixed(4) ?? '—'}]`
            );
            logger.print('');
          } catch (err) {
            const message = handleAnthropicError(err);
            logger.error(message);
            // Remove the failed user message from history
            history.pop();
            if (session) session.messages.pop();
          }

          promptUser();
        });
      };

      promptUser();

      // Handle clean shutdown — auto-save session
      rl.on('close', () => {
        if (session && session.messages.length > 0) {
          saveSession(session);
        }
        process.exit(0);
      });
    });
}
