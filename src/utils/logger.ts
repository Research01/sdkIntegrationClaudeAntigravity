/**
 * Logging utility.
 * - In MCP mode: all output goes to stderr (never stdout — stdout is reserved for JSON-RPC).
 * - In CLI mode: user-facing output goes to stdout, debug/errors to stderr.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

let verbose = false;
let mcpMode = false;

export function setVerbose(v: boolean): void {
  verbose = v;
}

export function setMcpMode(m: boolean): void {
  mcpMode = m;
}

function timestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${timestamp()}] [${level.toUpperCase()}] ${message}`;
}

/** Mask sensitive values (API keys, tokens) in log output */
export function maskSensitive(value: string): string {
  // Mask Anthropic API keys
  return value.replace(/sk-ant-[a-zA-Z0-9_-]{10,}/g, 'sk-ant-****');
}

/** Debug messages — only shown in verbose mode, always to stderr */
export function debug(message: string): void {
  if (verbose) {
    process.stderr.write(formatMessage('debug', maskSensitive(message)) + '\n');
  }
}

/** Info messages — stderr in MCP mode, stdout in CLI mode */
export function info(message: string): void {
  const formatted = formatMessage('info', maskSensitive(message));
  if (mcpMode) {
    process.stderr.write(formatted + '\n');
  } else {
    process.stderr.write(formatted + '\n');
  }
}

/** User-facing output — stdout in CLI, stderr in MCP */
export function print(message: string): void {
  if (mcpMode) {
    process.stderr.write(message + '\n');
  } else {
    process.stdout.write(message + '\n');
  }
}

/** Warning messages — always stderr */
export function warn(message: string): void {
  process.stderr.write(formatMessage('warn', maskSensitive(message)) + '\n');
}

/** Error messages — always stderr */
export function error(message: string): void {
  process.stderr.write(formatMessage('error', maskSensitive(message)) + '\n');
}
