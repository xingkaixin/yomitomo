import type { LlmProvider } from '@yomitomo/shared';
import type {
  AssistantProviderEvent,
  AssistantRuntimeTurn,
  AssistantToolCall,
} from './assistant-runtime';
import { parseJsonObject } from './json';
import { callProviderText, type TextPayload } from './provider-client';

export type AssistantProviderAdapterPayload = TextPayload;

export type AssistantProviderAdapterOptions = {
  failOnMaxTokens?: boolean;
};

export function createAssistantProviderModelAdapter(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  options: AssistantProviderAdapterOptions = {},
) {
  return async (turn: AssistantRuntimeTurn): Promise<AssistantProviderEvent> =>
    callAssistantProviderEvent(provider, assistantProviderTurnPayload(payload, turn), options);
}

export async function callAssistantProviderEvent(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  options: AssistantProviderAdapterOptions = {},
): Promise<AssistantProviderEvent> {
  try {
    const content = await callProviderText(provider, payload, {
      failOnMaxTokens: options.failOnMaxTokens ?? true,
    });
    return parseAssistantProviderEvent(content);
  } catch (error) {
    return {
      type: 'provider_failure',
      reason: error instanceof Error ? error.message : 'provider_failed',
    };
  }
}

export function parseAssistantProviderEvent(content: string): AssistantProviderEvent {
  let parsed: Record<string, unknown>;
  try {
    parsed = parseJsonObject(content);
  } catch {
    return {
      type: 'invalid_response',
      reason: 'provider_event_not_json',
      raw: content,
    };
  }

  const type = stringField(parsed.type);
  if (type === 'tool_call') {
    const toolCall = parseToolCall(parsed.toolCall || parsed);
    if (!toolCall) {
      return {
        type: 'invalid_response',
        reason: 'invalid_tool_call_event',
        raw: parsed,
      };
    }
    return {
      type: 'tool_call',
      toolCall,
    };
  }

  if (type === 'final_action') {
    return {
      type: 'final_action',
      action: parsed.action,
    };
  }

  if (type === 'invalid_response') {
    return {
      type: 'invalid_response',
      reason: stringField(parsed.reason) || 'provider_reported_invalid_response',
      raw: parsed.raw,
    };
  }

  if (type === 'provider_failure') {
    return {
      type: 'provider_failure',
      reason: stringField(parsed.reason) || 'provider_reported_failure',
      retryable: typeof parsed.retryable === 'boolean' ? parsed.retryable : undefined,
    };
  }

  return {
    type: 'invalid_response',
    reason: 'unknown_provider_event_type',
    raw: parsed,
  };
}

function assistantProviderTurnPayload(
  payload: AssistantProviderAdapterPayload,
  turn: AssistantRuntimeTurn,
): AssistantProviderAdapterPayload {
  return {
    ...payload,
    user: `${payload.user}\n\nassistant_runtime_turn:\n${JSON.stringify(
      {
        taskType: turn.taskType,
        articleId: turn.articleId,
        agentId: turn.agentId,
        stepIndex: turn.stepIndex,
        repairReason: turn.repairReason,
        availableTools: turn.availableTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
        })),
        evidence: turn.evidence.map((item) => ({
          id: item.id,
          summary: item.summary,
          provenance: item.provenance,
        })),
      },
      null,
      2,
    )}\n\nReturn exactly one JSON object with one of these shapes:\n{"type":"tool_call","toolCall":{"name":"tool_name","input":{}}}\n{"type":"final_action","action":{}}\nNo Markdown.`,
  };
}

function parseToolCall(value: unknown): AssistantToolCall | null {
  if (!isRecord(value)) return null;
  const name = stringField(value.name || value.toolName || value.tool_name);
  if (!name) return null;
  return {
    id: stringField(value.id) || undefined,
    name: name as AssistantToolCall['name'],
    input: value.input || value.arguments || {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}
