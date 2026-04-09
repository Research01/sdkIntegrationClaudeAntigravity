import { ask, healthCheck, listModels } from '../anthropicClient.js';
import * as logger from '../utils/logger.js';
import { validatePrompt, validateModel, validateMaxTokens, validateTemperature, validateSystem } from '../utils/validation.js';
import type { ClaudeAskInput, ClaudeExplainInput } from '../types.js';

/**
 * Handler for the claude_ask tool.
 */
export async function handleClaudeAsk(input: ClaudeAskInput): Promise<string> {
  const prompt = validatePrompt(input.prompt);
  const system = validateSystem(input.system);
  const model = validateModel(input.model);
  const maxTokens = validateMaxTokens(input.max_tokens);
  const temperature = validateTemperature(input.temperature);

  logger.debug(`claude_ask: model=${model || 'default'}, prompt length=${prompt.length}`);

  const response = await ask({ prompt, system, model, maxTokens, temperature });

  const metadata = [
    `Model: ${response.model}`,
    `Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`,
    `Stop reason: ${response.stopReason}`,
  ].join(' | ');

  return `${response.content}\n\n---\n${metadata}`;
}

/**
 * Handler for the claude_health tool.
 */
export async function handleClaudeHealth(): Promise<string> {
  const result = await healthCheck();

  const lines = [
    `Status: ${result.status.toUpperCase()}`,
    `Model: ${result.model}`,
    `API Key Configured: ${result.apiKeyConfigured ? 'Yes' : 'No'}`,
    `API Reachable: ${result.apiReachable ? 'Yes' : 'No'}`,
    `Latency: ${result.latencyMs}ms`,
  ];

  if (result.error) {
    lines.push(`Error: ${result.error}`);
  }

  return lines.join('\n');
}

/**
 * Handler for the claude_list_models tool.
 */
export async function handleClaudeListModels(): Promise<string> {
  const models = await listModels();

  if (models.length === 0) {
    return 'No models found. This may indicate a permissions issue with your API key.';
  }

  const lines = models.map((m) => {
    const parts = [`- ${m.id}`];
    if (m.displayName) parts.push(`(${m.displayName})`);
    if (m.createdAt) parts.push(`[${m.createdAt}]`);
    return parts.join(' ');
  });

  return `Available models (${models.length}):\n\n${lines.join('\n')}`;
}

/**
 * Handler for the claude_explain_project tool.
 */
export async function handleClaudeExplainProject(input: ClaudeExplainInput): Promise<string> {
  const codeOrSummary = validatePrompt(input.code_or_summary);

  let systemPrompt = 'You are an expert software engineer. Provide a clear, detailed technical explanation of the following code or project summary. Include: purpose, key components, architecture decisions, potential issues, and suggestions for improvement.';

  if (input.language) {
    systemPrompt += ` The code is written in ${input.language}.`;
  }

  if (input.context) {
    systemPrompt += ` Additional context: ${input.context}`;
  }

  logger.debug(`claude_explain_project: code length=${codeOrSummary.length}`);

  const response = await ask({
    prompt: codeOrSummary,
    system: systemPrompt,
  });

  return response.content;
}
