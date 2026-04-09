/**
 * Input validation helpers for CLI and MCP tool inputs.
 */

export function validatePrompt(prompt: unknown): string {
  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    throw new Error('Prompt must be a non-empty string.');
  }
  return prompt.trim();
}

export function validateModel(model: unknown): string | undefined {
  if (model === undefined || model === null) return undefined;
  if (typeof model !== 'string' || model.trim().length === 0) {
    throw new Error('Model must be a non-empty string if provided.');
  }
  return model.trim();
}

export function validateMaxTokens(maxTokens: unknown): number | undefined {
  if (maxTokens === undefined || maxTokens === null) return undefined;
  const parsed = typeof maxTokens === 'number' ? maxTokens : parseInt(String(maxTokens), 10);
  if (isNaN(parsed) || parsed <= 0 || parsed > 200_000) {
    throw new Error('max_tokens must be a positive integer (max 200000).');
  }
  return parsed;
}

export function validateTemperature(temp: unknown): number | undefined {
  if (temp === undefined || temp === null) return undefined;
  const parsed = typeof temp === 'number' ? temp : parseFloat(String(temp));
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error('Temperature must be a number between 0.0 and 1.0.');
  }
  return parsed;
}

export function validateSystem(system: unknown): string | undefined {
  if (system === undefined || system === null) return undefined;
  if (typeof system !== 'string') {
    throw new Error('System prompt must be a string if provided.');
  }
  return system.trim() || undefined;
}
