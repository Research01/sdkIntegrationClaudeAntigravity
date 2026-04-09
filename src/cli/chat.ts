import { Command } from 'commander';
import { createInterface } from 'readline';
import { chat } from '../anthropicClient.js';
import { handleAnthropicError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';
import type { ChatMessage } from '../types.js';

export function registerChatCommand(program: Command): void {
  program
    .command('chat')
    .description('Start an interactive multi-turn conversation with Claude')
    .option('-m, --model <model>', 'Model to use')
    .option('-t, --max-tokens <number>', 'Maximum tokens per response')
    .option('--temperature <number>', 'Temperature (0.0–1.0)')
    .option('-s, --system <prompt>', 'System prompt')
    .action(async (options: Record<string, string | undefined>) => {
      const model = options.model;
      const maxTokens = options.maxTokens ? parseInt(options.maxTokens, 10) : undefined;
      const temperature = options.temperature ? parseFloat(options.temperature) : undefined;
      const system = options.system;

      logger.print('╔══════════════════════════════════════════════╗');
      logger.print('║       Claude Interactive Chat                ║');
      logger.print('║  Type your message and press Enter.          ║');
      logger.print('║  Commands: /quit, /clear, /help              ║');
      logger.print('╚══════════════════════════════════════════════╝');
      logger.print('');

      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const history: ChatMessage[] = [];

      const promptUser = (): void => {
        rl.question('You > ', async (input: string) => {
          const trimmed = input.trim();

          if (!trimmed) {
            promptUser();
            return;
          }

          if (trimmed === '/quit' || trimmed === '/exit') {
            logger.print('\nGoodbye! 👋');
            rl.close();
            return;
          }

          if (trimmed === '/clear') {
            history.length = 0;
            logger.print('── Conversation cleared ──');
            promptUser();
            return;
          }

          if (trimmed === '/help') {
            logger.print('');
            logger.print('Commands:');
            logger.print('  /quit   - Exit the chat');
            logger.print('  /clear  - Clear conversation history');
            logger.print('  /help   - Show this help');
            logger.print('');
            promptUser();
            return;
          }

          history.push({ role: 'user', content: trimmed });

          try {
            const response = await chat(history, { system, model, maxTokens, temperature });
            history.push({ role: 'assistant', content: response.content });

            logger.print('');
            logger.print(`Claude > ${response.content}`);
            logger.print('');
            logger.print(`  [${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ tokens]`);
            logger.print('');
          } catch (err) {
            const message = handleAnthropicError(err);
            logger.error(message);
            // Remove the failed user message from history
            history.pop();
          }

          promptUser();
        });
      };

      promptUser();

      // Handle clean shutdown
      rl.on('close', () => {
        process.exit(0);
      });
    });
}
