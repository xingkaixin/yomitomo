import type { LlmProvider } from '@yomitomo/shared';
import type {
  AssistantProviderEvent,
  AssistantRuntimeTurn,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolResultMessage,
} from './assistant-runtime';
import { parseJsonObject } from './json';
import { generateYomitomoText } from './generation-runtime';
import { type JsonSchema, type TextPayload } from './provider-client';
import { normalizeAiUsage, type NormalizedAiUsage } from './usage';

export type AssistantProviderAdapterPayload = TextPayload;

export type AssistantProviderAdapterOptions = {
  failOnMaxTokens?: boolean;
};

export function createAssistantProviderModelAdapter(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  options: AssistantProviderAdapterOptions = {},
) {
  if (provider.type === 'openai-chat') {
    return createOpenAIChatToolModelAdapter(provider, payload, options);
  }
  return async (turn: AssistantRuntimeTurn): Promise<AssistantProviderEvent> =>
    callAssistantProviderEvent(provider, assistantProviderTurnPayload(payload, turn), options);
}

export async function callAssistantProviderEvent(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  options: AssistantProviderAdapterOptions = {},
): Promise<AssistantProviderEvent> {
  try {
    const result = await generateYomitomoText(
      provider,
      { ...payload, responseSchema: assistantProviderEventResponseSchema },
      {
        failOnMaxTokens: options.failOnMaxTokens ?? true,
      },
    );
    return withUsage(parseAssistantProviderEvent(result.text), result.usage);
  } catch (error) {
    return {
      type: 'provider_failure',
      reason: error instanceof Error ? error.message : 'provider_failed',
    };
  }
}

function withUsage<T extends AssistantProviderEvent>(
  event: T,
  usage: T['usage'],
): AssistantProviderEvent {
  return { ...event, usage };
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

  if (
    type === 'reply_to_thread' ||
    type === 'add_annotation' ||
    type === 'create_thread_thought' ||
    type === 'review_distillation' ||
    type === 'no_action'
  ) {
    return {
      type: 'final_action',
      action: parsed,
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
          toolName: item.toolName,
          summary: item.summary,
          text: item.text,
          provenance: item.provenance,
        })),
      },
      null,
      2,
    )}\n\nUse the listed evidence before calling another tool. Do not repeat the same tool with the same input; return final_action when the evidence is enough.\n\nReturn exactly one JSON object matching the configured response schema. Use null for inactive fields, including inactive tool input fields.`,
  };
}

const assistantProviderEventResponseSchema = {
  name: 'assistant_provider_event',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'toolCall', 'action', 'reason', 'raw', 'retryable'],
    properties: {
      type: {
        type: 'string',
        enum: ['tool_call', 'final_action', 'invalid_response', 'provider_failure'],
      },
      toolCall: nullableSchema({
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'input'],
        properties: {
          id: { type: ['string', 'null'] },
          name: {
            type: 'string',
            enum: [
              'get_current_thread',
              'get_anchor_context',
              'search_article_passages',
              'search_article_memory',
              'search_own_memory',
              'search_other_agents_memory',
              'check_duplicate_thought',
            ],
          },
          input: {
            type: 'object',
            additionalProperties: false,
            required: ['annotationId', 'query', 'limit', 'candidateThought', 'anchor'],
            properties: {
              annotationId: { type: ['string', 'null'] },
              query: { type: ['string', 'null'] },
              limit: { type: ['number', 'null'] },
              candidateThought: { type: ['string', 'null'] },
              anchor: nullableSchema({
                type: 'object',
                additionalProperties: false,
                required: ['exact', 'prefix', 'suffix', 'start', 'end'],
                properties: {
                  exact: { type: 'string' },
                  prefix: { type: 'string' },
                  suffix: { type: 'string' },
                  start: { type: 'number' },
                  end: { type: 'number' },
                },
              }),
            },
          },
        },
      }),
      action: nullableSchema({
        type: 'object',
        additionalProperties: false,
        required: [
          'type',
          'annotationId',
          'content',
          'anchor',
          'thought',
          'reason',
          'evidenceIds',
          'confidence',
        ],
        properties: {
          type: {
            type: 'string',
            enum: [
              'reply_to_thread',
              'add_annotation',
              'create_thread_thought',
              'review_distillation',
              'no_action',
            ],
          },
          annotationId: { type: ['string', 'null'] },
          content: { type: ['string', 'null'] },
          anchor: nullableSchema({
            type: 'object',
            additionalProperties: false,
            required: ['exact', 'prefix', 'suffix', 'start', 'end'],
            properties: {
              exact: { type: 'string' },
              prefix: { type: 'string' },
              suffix: { type: 'string' },
              start: { type: 'number' },
              end: { type: 'number' },
            },
          }),
          thought: { type: ['string', 'null'] },
          reason: { type: 'string' },
          evidenceIds: {
            type: 'array',
            items: { type: 'string' },
          },
          confidence: { type: 'number' },
        },
      }),
      reason: { type: ['string', 'null'] },
      raw: { type: ['string', 'null'] },
      retryable: { type: ['boolean', 'null'] },
    },
  },
} satisfies { name: string; strict: true; schema: JsonSchema };

function nullableSchema(schema: JsonSchema): JsonSchema {
  const type = typeof schema.type === 'string' ? [schema.type, 'null'] : schema.type;
  return { ...schema, type: type || ['object', 'null'] };
}

type OpenAIChatMessage =
  | {
      role: 'system' | 'user';
      content: string;
    }
  | {
      role: 'assistant';
      content?: string | null;
      tool_calls?: OpenAIChatToolCall[];
    }
  | {
      role: 'tool';
      tool_call_id: string;
      content: string;
    };

type OpenAIChatToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type OpenAIChatToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

function createOpenAIChatToolModelAdapter(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  options: AssistantProviderAdapterOptions,
) {
  const messages: OpenAIChatMessage[] = [
    { role: 'system', content: payload.system },
    { role: 'user', content: payload.user },
  ];
  const appendedToolResultIds = new Set<string>();
  const appendedRepairSteps = new Set<number>();

  return async (turn: AssistantRuntimeTurn): Promise<AssistantProviderEvent> => {
    appendToolResultMessages(messages, turn.toolResults || [], appendedToolResultIds);
    appendRepairMessage(messages, turn, appendedRepairSteps);
    try {
      const response = await callOpenAIChatToolTurn(provider, payload, messages, turn, options);
      if (response.type === 'tool_call') {
        messages.push(openAIToolAssistantMessage(response.toolCall));
      } else if (response.type === 'final_action') {
        messages.push({
          role: 'assistant',
          content: JSON.stringify(response.action),
        });
      }
      return response;
    } catch (error) {
      return {
        type: 'provider_failure',
        reason: error instanceof Error ? error.message : 'provider_failed',
      };
    }
  };
}

function appendRepairMessage(
  messages: OpenAIChatMessage[],
  turn: AssistantRuntimeTurn,
  appendedSteps: Set<number>,
) {
  if (!turn.repairReason || appendedSteps.has(turn.stepIndex)) return;
  messages.push({
    role: 'user',
    content: `Previous assistant final action was rejected: ${turn.repairReason}. Return a corrected final action JSON or call a tool if more evidence is required.`,
  });
  appendedSteps.add(turn.stepIndex);
}

async function callOpenAIChatToolTurn(
  provider: LlmProvider,
  payload: AssistantProviderAdapterPayload,
  messages: OpenAIChatMessage[],
  turn: AssistantRuntimeTurn,
  options: AssistantProviderAdapterOptions,
): Promise<AssistantProviderEvent> {
  const response = await fetch(`${openAIBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: jsonBearerHeaders(provider),
    body: JSON.stringify({
      model: provider.modelName,
      messages,
      tools: openAIChatTools(provider, turn),
      tool_choice: 'auto',
      max_tokens: payload.maxTokens,
      temperature: payload.temperature,
      ...openAIChatFinalActionResponseFormat(provider),
      ...openAICompatibleReasoningParams(provider, payload.maxTokens),
    }),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  const data = (await response.json()) as {
    usage?: OpenAIChatUsage;
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: OpenAIChatToolCall[];
      };
      finish_reason?: string;
    }>;
  };
  const choice = data.choices?.[0];
  const usage = normalizeOpenAIChatUsage(data.usage);
  if (options.failOnMaxTokens !== false && choice?.finish_reason === 'length') {
    throw new Error(`模型输出达到 max_tokens=${payload.maxTokens}，结构化 JSON 可能已被截断`);
  }
  const toolCall = choice?.message?.tool_calls?.[0];
  if (toolCall) {
    const action = finalActionFromToolCall(toolCall);
    if (action) {
      return {
        type: 'final_action',
        action,
        usage,
      };
    }
    return {
      type: 'tool_call',
      toolCall: {
        id: toolCall.id,
        name: toolCall.function.name as AssistantToolCall['name'],
        input: parseToolArguments(toolCall.function.arguments),
      },
      usage,
    };
  }
  const content = choice?.message?.content?.trim();
  if (!content) {
    return {
      type: 'invalid_response',
      reason: 'provider_returned_empty_message',
      raw: choice?.message,
      usage,
    };
  }
  return withUsage(parseAssistantProviderEvent(content), usage);
}

type OpenAIChatUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_write_tokens?: number;
  };
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
};

function normalizeOpenAIChatUsage(
  usage: OpenAIChatUsage | undefined,
): NormalizedAiUsage | undefined {
  if (!usage) return undefined;
  const normalized = normalizeAiUsage({
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens,
    inputTokenDetails: {
      cacheWriteTokens: usage.prompt_tokens_details?.cache_write_tokens,
    },
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function appendToolResultMessages(
  messages: OpenAIChatMessage[],
  results: AssistantToolResultMessage[],
  appendedIds: Set<string>,
) {
  for (const result of results) {
    if (appendedIds.has(result.toolCallId)) continue;
    messages.push({
      role: 'tool',
      tool_call_id: result.toolCallId,
      content: JSON.stringify({
        ok: result.ok,
        failureReason: result.failureReason,
        summary: result.summary,
        evidence: result.evidence.map((item) => ({
          id: item.id,
          toolName: item.toolName,
          summary: item.summary,
          text: item.text,
          provenance: item.provenance,
        })),
      }),
    });
    appendedIds.add(result.toolCallId);
  }
}

function openAIToolAssistantMessage(toolCall: AssistantToolCall): OpenAIChatMessage {
  return {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: toolCall.id || `tool_call_${Date.now()}`,
        type: 'function',
        function: {
          name: toolCall.name,
          arguments: JSON.stringify(toolCall.input || {}),
        },
      },
    ],
  };
}

function openAIToolDefinition(tool: AssistantToolDefinition): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || tool.name,
      parameters: toolInputSchema(tool.name),
    },
  };
}

function openAIChatTools(
  provider: LlmProvider,
  turn: AssistantRuntimeTurn,
): OpenAIChatToolDefinition[] {
  const tools = turn.availableTools.map(openAIToolDefinition);
  if (!supportsOpenAINativeJsonSchema(provider)) {
    tools.push(...finalActionToolDefinitions(turn.taskType));
  }
  return tools;
}

function finalActionToolDefinitions(
  taskType: AssistantRuntimeTurn['taskType'],
): OpenAIChatToolDefinition[] {
  if (taskType === 'thread_reply') return [replyToThreadToolDefinition()];
  if (taskType === 'create_thought') return [createThreadThoughtToolDefinition()];
  if (taskType === 'distillation_review') return [reviewDistillationToolDefinition()];
  return [addAnnotationToolDefinition(), noActionToolDefinition()];
}

function replyToThreadToolDefinition(): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'reply_to_thread',
      description:
        'Return the final thread reply action. This is a final action, not a lookup tool.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['annotationId', 'content', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          annotationId: { type: 'string' },
          content: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      } satisfies JsonSchema,
    },
  };
}

function addAnnotationToolDefinition(): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'add_annotation',
      description:
        'Return the final add-annotation action for the current target anchor. Do not include anchor.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['thought', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          thought: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      } satisfies JsonSchema,
    },
  };
}

function createThreadThoughtToolDefinition(): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'create_thread_thought',
      description:
        'Return the final action that appends a top-level assistant thought to the current annotation thread.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['annotationId', 'thought', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          annotationId: { type: 'string' },
          thought: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      } satisfies JsonSchema,
    },
  };
}

function reviewDistillationToolDefinition(): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'review_distillation',
      description: 'Return the final distillation review message for the current annotation.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['annotationId', 'content', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          annotationId: { type: 'string' },
          content: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      } satisfies JsonSchema,
    },
  };
}

function noActionToolDefinition(): OpenAIChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: 'no_action',
      description: 'Return the final no-action decision.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        required: ['evidenceIds', 'confidence', 'reason'],
        properties: {
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      } satisfies JsonSchema,
    },
  };
}

function finalActionFromToolCall(toolCall: OpenAIChatToolCall) {
  const name = toolCall.function.name;
  if (
    name !== 'reply_to_thread' &&
    name !== 'add_annotation' &&
    name !== 'create_thread_thought' &&
    name !== 'review_distillation' &&
    name !== 'no_action'
  ) {
    return null;
  }
  return {
    type: name,
    ...parseToolArguments(toolCall.function.arguments),
  };
}

function toolInputSchema(name: AssistantToolCall['name']): JsonSchema {
  if (name === 'get_current_thread') return emptyToolSchema();
  if (name === 'get_anchor_context') return emptyToolSchema();
  if (name === 'search_article_passages') return queryToolSchema();
  if (name === 'search_article_memory') return queryToolSchema();
  if (name === 'search_own_memory') return queryToolSchema();
  if (name === 'search_other_agents_memory') return queryToolSchema();
  if (name === 'check_duplicate_thought') {
    return {
      type: 'object',
      additionalProperties: false,
      required: ['candidateThought'],
      properties: {
        candidateThought: { type: 'string' },
        limit: { type: 'number' },
      },
    };
  }
  return emptyToolSchema();
}

function emptyToolSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: [],
    properties: {},
  };
}

function queryToolSchema(): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['query'],
    properties: {
      query: { type: 'string' },
      limit: { type: 'number' },
    },
  };
}

function openAIChatFinalActionResponseFormat(provider: LlmProvider) {
  if (!supportsOpenAINativeJsonSchema(provider)) return {};
  return {
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: assistantFinalActionResponseSchema.name,
        strict: false,
        schema: assistantFinalActionResponseSchema.schema,
      },
    },
  };
}

const assistantFinalActionResponseSchema = {
  name: 'assistant_final_action',
  schema: {
    anyOf: [
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'annotationId', 'content', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          type: { const: 'reply_to_thread' },
          annotationId: { type: 'string' },
          content: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'thought', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          type: { const: 'add_annotation' },
          thought: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'annotationId', 'thought', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          type: { const: 'create_thread_thought' },
          annotationId: { type: 'string' },
          thought: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'annotationId', 'content', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          type: { const: 'review_distillation' },
          annotationId: { type: 'string' },
          content: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
      {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'evidenceIds', 'confidence', 'reason'],
        properties: {
          type: { const: 'no_action' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          reason: { type: 'string' },
        },
      },
    ],
  },
} satisfies { name: string; schema: JsonSchema };

function parseToolArguments(value: string) {
  try {
    const parsed = JSON.parse(value || '{}') as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function supportsOpenAINativeJsonSchema(provider: LlmProvider) {
  return provider.presetId === 'openai' || /^https:\/\/api\.openai\.com\/?/.test(provider.baseUrl);
}

function openAICompatibleReasoningParams(provider: LlmProvider, maxTokens: number) {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return {};
  const model = provider.modelName.toLowerCase();
  if (effort === 'none') {
    if (provider.presetId === 'dashscope' && /(qwen|deepseek|glm|kimi)/.test(model)) {
      return { enable_thinking: false };
    }
    if (/(doubao|glm|mimo|kimi|deepseek-v4|deepseek-v5)/.test(model)) {
      return { thinking: { type: 'disabled' } };
    }
    return {};
  }
  if (provider.presetId === 'dashscope' && /(qwen|deepseek|glm|kimi)/.test(model)) {
    return { enable_thinking: true, thinking_budget: thinkingBudget(effort, maxTokens) };
  }
  if (/doubao-seed-(1[-.]8|2[-.]0)/.test(model)) {
    return { reasoning_effort: normalizeOpenAIEffort(effort) };
  }
  if (/doubao/.test(model)) {
    return effort === 'auto' ? { thinking: { type: 'auto' } } : { thinking: { type: 'enabled' } };
  }
  if (/(glm|mimo|kimi|deepseek)/.test(model)) return { thinking: { type: 'enabled' } };
  return { reasoning_effort: normalizeOpenAIEffort(effort) };
}

function normalizeOpenAIEffort(effort: LlmProvider['reasoningEffort']) {
  if (effort === 'default' || effort === 'auto') return undefined;
  if (effort === 'xhigh') return 'high';
  return effort;
}

function thinkingBudget(effort: LlmProvider['reasoningEffort'], maxTokens: number) {
  const ratio: Record<NonNullable<LlmProvider['reasoningEffort']>, number> = {
    default: 0,
    none: 0,
    minimal: 0.05,
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    xhigh: 1,
    auto: 0,
  };
  if (!effort || effort === 'auto') return undefined;
  return Math.min(maxTokens, Math.max(1024, Math.round(16_384 * ratio[effort])));
}

function openAIBaseUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, '');
  return /\/v\d+(?:beta)?$/.test(base) ? base : `${base}/v1`;
}

function jsonBearerHeaders(provider: LlmProvider): Record<string, string> {
  return {
    'content-type': 'application/json',
    ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {}),
  };
}

async function modelListError(response: Response) {
  const text = await response.text();
  return `模型服务请求失败：${response.status} ${text.slice(0, 400)}`;
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
