import { ask, listModels } from '../anthropicClient.js';
import { getConfig } from '../anthropicClient.js';
import { chat } from '../anthropicClient.js';
import * as logger from '../utils/logger.js';
import { validatePrompt, validateModel, validateMaxTokens, validateTemperature, validateSystem } from '../utils/validation.js';
import { estimateCost, formatCostEstimate, calculateActualCost, formatActualCostShort } from '../utils/costEstimator.js';
import {
  listSessions,
  loadSession,
  loadSessionByName,
  saveSession,
  createSession,
  appendUserMessage,
  appendAssistantMessage,
  formatSessionList,
} from '../utils/conversationStore.js';
import { healthCheck } from '../anthropicClient.js';
import type {
  ClaudeAskInput,
  ClaudeExplainInput,
  ClaudeEstimateCostInput,
  ClaudeSessionChatInput,
  ClaudeSessionLoadInput,
} from '../types.js';

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

  const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);

  const metadata = [
    `Model: ${response.model}`,
    `Tokens: ${response.usage.inputTokens} in / ${response.usage.outputTokens} out`,
    `Cost: ${formatActualCostShort(costUsd)}`,
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

// ── v2 Handlers ──────────────────────────────────────────────────

/**
 * Handler for the claude_estimate_cost tool.
 * v2 — Token cost estimation before request.
 */
export async function handleClaudeEstimateCost(input: ClaudeEstimateCostInput): Promise<string> {
  const prompt = validatePrompt(input.prompt);
  const system = input.system;

  let effectiveModel: string;
  try {
    effectiveModel = input.model || getConfig().model;
  } catch {
    effectiveModel = 'claude-sonnet-4-20250514';
  }

  const estimate = estimateCost(
    effectiveModel,
    prompt,
    system,
    input.expected_output_tokens ?? 1024,
  );

  return formatCostEstimate(estimate);
}

/**
 * Handler for the claude_session_list tool.
 * v2 — List all saved conversation sessions.
 */
export async function handleClaudeSessionList(): Promise<string> {
  const sessions = listSessions();
  return formatSessionList(sessions);
}

/**
 * Handler for the claude_session_load tool.
 * v2 — Load a saved session and return its history.
 */
export async function handleClaudeSessionLoad(input: ClaudeSessionLoadInput): Promise<string> {
  const session = loadSession(input.session_id) ?? loadSessionByName(input.session_id);
  if (!session) {
    return `Session not found: "${input.session_id}"`;
  }

  const lines = [
    `Session: ${session.name} [${session.id}]`,
    `Created: ${session.createdAt}`,
    `Updated: ${session.updatedAt}`,
    `Turns:   ${session.metadata.turnCount}`,
    `Tokens:  ${session.metadata.totalInputTokens}↑ / ${session.metadata.totalOutputTokens}↓`,
    `Cost:    $${session.metadata.totalCostUsd.toFixed(6)}`,
    '',
    '── Message History ─────────────────────────────────',
    ...session.messages.map((m, i) => `[${i + 1}] ${m.role.toUpperCase()}: ${m.content.slice(0, 200)}${m.content.length > 200 ? '…' : ''}`),
  ];

  return lines.join('\n');
}

/**
 * Handler for the claude_session_chat tool.
 * v2 — Continue a persisted session with a new message.
 */
export async function handleClaudeSessionChat(input: ClaudeSessionChatInput): Promise<string> {
  const message = validatePrompt(input.message);

  // Load or create session
  let session = loadSession(input.session_id) ?? loadSessionByName(input.session_id);
  if (!session) {
    return `Session not found: "${input.session_id}". Use claude_session_list to see available sessions.`;
  }

  appendUserMessage(session, message);

  logger.debug(`claude_session_chat: session=${session.name}, turn=${session.metadata.turnCount + 1}`);

  const response = await chat(session.messages, {
    system: session.system,
    model: input.model || session.model,
    maxTokens: input.max_tokens,
    temperature: input.temperature,
  });

  const costUsd = calculateActualCost(response.model, response.usage.inputTokens, response.usage.outputTokens);

  appendAssistantMessage(
    session,
    response.content,
    response.usage.inputTokens,
    response.usage.outputTokens,
    costUsd,
  );
  saveSession(session);

  const metadata = [
    `Session: ${session.name} | Turn: ${session.metadata.turnCount}`,
    `Tokens: ${response.usage.inputTokens}↑ ${response.usage.outputTokens}↓ | Cost: ${formatActualCostShort(costUsd)}`,
    `Session total: $${session.metadata.totalCostUsd.toFixed(6)}`,
  ].join('\n');

  return `${response.content}\n\n---\n${metadata}`;
}
