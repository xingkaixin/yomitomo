import { jsonSchema, stepCountIs, streamText, type JSONSchema7 } from 'ai';
import type { LlmProvider, TextAnchor } from '@yomitomo/shared';
import { createYomitomoLanguageModel, supportsProviderTools } from './ai-sdk-provider-adapter';
import type { NormalizedAiUsage } from './usage';
import { normalizeAiUsage } from './usage';

export type AssistantRuntimeTaskType =
  | 'thread_reply'
  | 'create_thought'
  | 'distillation_review'
  | 'selection_first'
  | 'co_reading_section';

export type AssistantToolName =
  | 'get_current_thread'
  | 'get_anchor_context'
  | 'search_article_passages'
  | 'search_article_memory'
  | 'search_own_memory'
  | 'search_other_agents_memory'
  | 'check_duplicate_thought';

export type AssistantRuntimeBudget = {
  maxSteps: number;
  maxToolResults: number;
  maxToolResultCharacters: number;
};

export const DEFAULT_ASSISTANT_RUNTIME_BUDGETS: Record<
  AssistantRuntimeTaskType,
  AssistantRuntimeBudget
> = {
  thread_reply: {
    maxSteps: 20,
    maxToolResults: 6,
    maxToolResultCharacters: 2400,
  },
  create_thought: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  distillation_review: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  selection_first: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3200,
  },
  co_reading_section: {
    maxSteps: 20,
    maxToolResults: 8,
    maxToolResultCharacters: 3600,
  },
};

export type AssistantToolDefinition = {
  name: AssistantToolName;
  description?: string;
  validateInput?: (input: unknown) => string | null;
};

export type AssistantToolCall = {
  id?: string;
  name: AssistantToolName;
  input: unknown;
};

export type AssistantEvidenceProvenance = {
  articleId: string;
  sourceType: string;
  sourceAnnotationId?: string;
  sourceCommentId?: string;
  agentId?: string;
  authorType?: 'user' | 'ai' | 'system';
  anchor?: TextAnchor;
  textStart?: number;
  textEnd?: number;
  createdAt?: string;
};

export type AssistantToolEvidenceInput = {
  summary: string;
  text?: string;
  provenance: AssistantEvidenceProvenance;
};

export type AssistantEvidence = AssistantToolEvidenceInput & {
  id: string;
  toolCallId: string;
  toolName: AssistantToolName;
};

export type AssistantToolExecutionResult =
  | {
      ok: true;
      summary?: string;
      evidence?: AssistantToolEvidenceInput[];
    }
  | {
      ok: false;
      failureReason: string;
    };

export type AssistantProviderToolCallEvent = {
  type: 'tool_call';
  toolCall: AssistantToolCall;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderFinalActionEvent = {
  type: 'final_action';
  action: unknown;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderInvalidResponseEvent = {
  type: 'invalid_response';
  reason: string;
  raw?: unknown;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderFailureEvent = {
  type: 'provider_failure';
  reason: string;
  retryable?: boolean;
  usage?: NormalizedAiUsage;
};

export type AssistantProviderEvent =
  | AssistantProviderToolCallEvent
  | AssistantProviderFinalActionEvent
  | AssistantProviderInvalidResponseEvent
  | AssistantProviderFailureEvent;

export type AssistantToolResultMessage = {
  toolCallId: string;
  toolName: AssistantToolName;
  ok: boolean;
  summary?: string;
  evidenceIds: string[];
  evidence: AssistantEvidence[];
  failureReason?: string;
};

export type AssistantFinalAction =
  | {
      type: 'reply_to_thread';
      annotationId: string;
      content: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'add_annotation';
      anchor: TextAnchor;
      thought: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'create_thread_thought';
      annotationId: string;
      thought: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'review_distillation';
      annotationId: string;
      content: string;
      evidenceIds: string[];
      confidence: number;
      reason: string;
    }
  | {
      type: 'no_action';
      reason: string;
      evidenceIds: string[];
      confidence: number;
    };

export type AssistantRuntimeTurn = {
  taskType: AssistantRuntimeTaskType;
  articleId: string;
  agentId: string;
  stepIndex: number;
  availableTools: AssistantToolDefinition[];
  evidence: AssistantEvidence[];
  toolResults: AssistantToolResultMessage[];
  repairReason?: string;
};

export type AssistantRuntimeTraceStep = {
  stepIndex: number;
  eventType: AssistantProviderEvent['type'];
  toolName?: AssistantToolName;
  sanitizedToolInput?: unknown;
  resultCount: number;
  evidenceIds: string[];
  evidenceSummaries: Array<{
    id: string;
    summary: string;
    provenance: AssistantEvidenceProvenance;
  }>;
  latencyMs: number;
  failureReason?: string;
};

export type AssistantRuntimeTrace = {
  taskType: AssistantRuntimeTaskType;
  agentId: string;
  articleId: string;
  startedAt: string;
  completedAt?: string;
  steps: AssistantRuntimeTraceStep[];
  finalActionType?: AssistantFinalAction['type'];
  failureReason?: string;
  usage?: NormalizedAiUsage;
};

export type AssistantRuntimeResult =
  | {
      status: 'final';
      action: AssistantFinalAction;
      evidence: AssistantEvidence[];
      trace: AssistantRuntimeTrace;
      repairUsed: boolean;
    }
  | {
      status: 'fallback';
      failureReason: string;
      evidence: AssistantEvidence[];
      trace: AssistantRuntimeTrace;
      repairUsed: boolean;
    };

export type AssistantRuntimeStreamEvent =
  | {
      type: 'tool_call';
      toolName: AssistantToolName;
      stepIndex: number;
    }
  | {
      type: 'tool_result';
      toolName: AssistantToolName;
      stepIndex: number;
      ok: boolean;
    }
  | {
      type: 'text_delta';
      delta: string;
    }
  | {
      type: 'fallback';
      reason: string;
    }
  | {
      type: 'done';
      usage?: NormalizedAiUsage;
      trace: AssistantRuntimeTrace;
    };

export type AssistantRuntimeOptions = {
  taskType: AssistantRuntimeTaskType;
  articleId: string;
  agentId: string;
  tools: AssistantToolDefinition[];
  allowedAnnotationIds?: string[];
  addAnnotationAnchor?: TextAnchor;
  budget?: Partial<AssistantRuntimeBudget>;
  now?: () => string;
  modelAdapter: (turn: AssistantRuntimeTurn) => Promise<AssistantProviderEvent>;
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};

export type AssistantAiSdkRuntimeOptions = {
  taskType: 'thread_reply' | 'create_thought' | 'distillation_review';
  articleId: string;
  agentId: string;
  provider: LlmProvider;
  payload: {
    system: string;
    user: string;
    maxTokens: number;
    temperature?: number;
  };
  tools: AssistantToolDefinition[];
  allowedAnnotationIds: string[];
  budget?: Partial<AssistantRuntimeBudget>;
  now?: () => string;
  onEvent?: (event: AssistantRuntimeStreamEvent) => void;
  toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
};

type AiSdkToolShape = {
  description?: string;
  inputSchema: ReturnType<typeof jsonSchema>;
  execute: (
    input: unknown,
    options: {
      toolCallId: string;
    },
  ) => Promise<AssistantToolExecutionResult>;
};

class AssistantRuntimeFailure extends Error {
  constructor(readonly failureReason: string) {
    super(failureReason);
    this.name = 'AssistantRuntimeFailure';
  }
}

export async function runAssistantAiSdkToolRuntime(
  options: AssistantAiSdkRuntimeOptions,
): Promise<AssistantRuntimeResult> {
  const budget = { ...DEFAULT_ASSISTANT_RUNTIME_BUDGETS[options.taskType], ...options.budget };
  const now = options.now || (() => new Date().toISOString());
  const trace: AssistantRuntimeTrace = {
    taskType: options.taskType,
    agentId: options.agentId,
    articleId: options.articleId,
    startedAt: now(),
    steps: [],
  };
  const evidence: AssistantEvidence[] = [];
  const toolsByName = new Map(
    options.tools.map((toolDefinition) => [toolDefinition.name, toolDefinition]),
  );
  let nextStepIndex = 0;

  if (!supportsProviderTools(options.provider)) {
    return emitFallback(options, trace, evidence, 'provider_tools_unsupported', false, now);
  }

  const adapter = createYomitomoLanguageModel(options.provider);
  const aiSdkTools = Object.fromEntries(
    options.tools.map((toolDefinition) => [
      toolDefinition.name,
      aiSdkTool(toolDefinition, {
        articleId: options.articleId,
        budget,
        evidence,
        nextStepIndex: () => nextStepIndex,
        incrementStepIndex: () => {
          nextStepIndex += 1;
        },
        onEvent: options.onEvent,
        toolsByName,
        toolExecutor: options.toolExecutor,
        trace,
      }),
    ]),
  ) as Record<string, AiSdkToolShape>;

  try {
    const result = streamText({
      model: adapter.model,
      system: options.payload.system,
      prompt: options.payload.user,
      maxOutputTokens: options.payload.maxTokens,
      temperature: options.payload.temperature,
      providerOptions: adapter.providerOptions,
      tools: aiSdkTools,
      stopWhen: stepCountIs(budget.maxSteps),
      prepareStep: ({ stepNumber }) =>
        stepNumber === 0 && options.tools.length > 0
          ? {
              toolChoice: {
                type: 'tool' as const,
                toolName: firstRequiredRuntimeToolName(options.tools),
              },
            }
          : undefined,
    });
    let text = '';
    for await (const delta of result.textStream) {
      text += delta;
      options.onEvent?.({ type: 'text_delta', delta });
    }

    const finishReason = await result.finishReason;
    trace.usage = normalizeAiUsage(await result.totalUsage);
    if (finishReason === 'length') {
      return emitFallback(
        options,
        trace,
        evidence,
        `model_output_reached_max_tokens:${options.payload.maxTokens}`,
        false,
        now,
      );
    }

    const action = finalActionFromText(options, text);
    const validation = validateAssistantFinalAction(action, {
      articleId: options.articleId,
      evidenceIds: new Set(evidence.map((item) => item.id)),
      allowedAnnotationIds: options.allowedAnnotationIds,
    });
    if (!validation.ok) {
      return emitFallback(options, trace, evidence, validation.reason, false, now);
    }

    trace.steps.push({
      stepIndex: nextStepIndex,
      eventType: 'final_action',
      resultCount: 0,
      evidenceIds: [],
      evidenceSummaries: [],
      latencyMs: 0,
    });
    trace.completedAt = now();
    trace.finalActionType = validation.action.type;
    options.onEvent?.({ type: 'done', usage: trace.usage, trace });
    return {
      status: 'final',
      action: validation.action,
      evidence,
      trace,
      repairUsed: false,
    };
  } catch (error) {
    const failureReason =
      error instanceof AssistantRuntimeFailure
        ? error.failureReason
        : error instanceof Error
          ? error.message
          : 'provider_failed';
    return emitFallback(options, trace, evidence, failureReason, false, now);
  }
}

function firstRequiredRuntimeToolName(tools: AssistantToolDefinition[]) {
  const toolNames = new Set(tools.map((tool) => tool.name));
  if (toolNames.has('get_current_thread')) return 'get_current_thread';
  if (toolNames.has('get_anchor_context')) return 'get_anchor_context';
  return tools[0].name;
}

export async function runAssistantToolRuntime(
  options: AssistantRuntimeOptions,
): Promise<AssistantRuntimeResult> {
  const budget = { ...DEFAULT_ASSISTANT_RUNTIME_BUDGETS[options.taskType], ...options.budget };
  const now = options.now || (() => new Date().toISOString());
  const trace: AssistantRuntimeTrace = {
    taskType: options.taskType,
    agentId: options.agentId,
    articleId: options.articleId,
    startedAt: now(),
    steps: [],
  };
  const toolsByName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const evidence: AssistantEvidence[] = [];
  const toolResults: AssistantToolResultMessage[] = [];
  let repairReason: string | undefined;
  let repairUsed = false;

  for (let stepIndex = 0; stepIndex < budget.maxSteps; stepIndex += 1) {
    const startedAt = performance.now();
    const event = await options.modelAdapter({
      taskType: options.taskType,
      articleId: options.articleId,
      agentId: options.agentId,
      stepIndex,
      availableTools: options.tools,
      evidence,
      toolResults,
      repairReason,
    });
    trace.usage = addUsage(trace.usage, event.usage);
    repairReason = undefined;

    if (event.type === 'tool_call') {
      const toolCallId = event.toolCall.id || `tool_call_${stepIndex}`;
      const tool = toolsByName.get(event.toolCall.name);
      const invalidReason =
        tool?.validateInput?.(event.toolCall.input) ||
        (!tool ? `unknown_tool:${event.toolCall.name}` : null);
      if (invalidReason) {
        toolResults.push({
          toolCallId,
          toolName: event.toolCall.name,
          ok: false,
          failureReason: invalidReason,
          evidenceIds: [],
          evidence: [],
        });
        trace.steps.push(
          traceStep(stepIndex, event, startedAt, {
            failureReason: invalidReason,
          }),
        );
        const repair = requestRepair(invalidReason, repairUsed);
        if (!repair.ok) return fallback(trace, evidence, repair.reason, repairUsed, now);
        repairUsed = true;
        repairReason = repair.reason;
        continue;
      }

      const result = await options.toolExecutor(event.toolCall);
      if (!result.ok) {
        trace.steps.push(
          traceStep(stepIndex, event, startedAt, {
            failureReason: result.failureReason,
          }),
        );
        return fallback(trace, evidence, result.failureReason, repairUsed, now);
      }

      const invalidEvidence = (result.evidence || []).find(
        (item) => item.provenance.articleId !== options.articleId,
      );
      if (invalidEvidence) {
        const failureReason = `evidence_article_mismatch:${invalidEvidence.provenance.articleId}`;
        trace.steps.push(
          traceStep(stepIndex, event, startedAt, {
            failureReason,
          }),
        );
        return fallback(trace, evidence, failureReason, repairUsed, now);
      }

      const nextEvidence = (result.evidence || [])
        .slice(0, budget.maxToolResults)
        .map((item, index) =>
          normalizeEvidence(item, {
            id: `evidence_${stepIndex}_${index}`,
            toolCallId,
            toolName: event.toolCall.name,
            maxCharacters: budget.maxToolResultCharacters,
          }),
        );
      evidence.push(...nextEvidence);
      toolResults.push({
        toolCallId,
        toolName: event.toolCall.name,
        ok: true,
        summary: result.summary,
        evidenceIds: nextEvidence.map((item) => item.id),
        evidence: nextEvidence,
      });
      trace.steps.push(
        traceStep(stepIndex, event, startedAt, {
          resultCount: nextEvidence.length,
          evidenceIds: nextEvidence.map((item) => item.id),
          evidenceSummaries: nextEvidence.map((item) => ({
            id: item.id,
            summary: item.summary,
            provenance: item.provenance,
          })),
        }),
      );
      continue;
    }

    if (event.type === 'final_action') {
      const validation = validateAssistantFinalAction(event.action, {
        articleId: options.articleId,
        evidenceIds: new Set(evidence.map((item) => item.id)),
        allowedAnnotationIds: options.allowedAnnotationIds,
        addAnnotationAnchor: options.addAnnotationAnchor,
      });
      if (!validation.ok) {
        trace.steps.push(
          traceStep(stepIndex, event, startedAt, {
            failureReason: validation.reason,
          }),
        );
        const repair = requestRepair(validation.reason, repairUsed);
        if (!repair.ok) return fallback(trace, evidence, repair.reason, repairUsed, now);
        repairUsed = true;
        repairReason = repair.reason;
        continue;
      }

      trace.steps.push(traceStep(stepIndex, event, startedAt));
      trace.completedAt = now();
      trace.finalActionType = validation.action.type;
      return {
        status: 'final',
        action: validation.action,
        evidence,
        trace,
        repairUsed,
      };
    }

    if (event.type === 'provider_failure') {
      trace.steps.push(
        traceStep(stepIndex, event, startedAt, {
          failureReason: event.reason,
        }),
      );
      return fallback(trace, evidence, event.reason, repairUsed, now);
    }

    trace.steps.push(
      traceStep(stepIndex, event, startedAt, {
        failureReason: event.reason,
      }),
    );
    const repair = requestRepair(event.reason, repairUsed);
    if (!repair.ok) return fallback(trace, evidence, repair.reason, repairUsed, now);
    repairUsed = true;
    repairReason = repair.reason;
  }

  return fallback(trace, evidence, 'step_limit_exceeded', repairUsed, now);
}

export function validateAssistantFinalAction(
  value: unknown,
  context: {
    articleId: string;
    evidenceIds: Set<string>;
    allowedAnnotationIds?: string[];
    addAnnotationAnchor?: TextAnchor;
  },
): { ok: true; action: AssistantFinalAction } | { ok: false; reason: string } {
  if (!isRecord(value)) return { ok: false, reason: 'final_action_not_object' };
  const type = stringField(value.type);
  const evidenceIds = evidenceIdArray(value);
  if (!evidenceIds) return { ok: false, reason: 'invalid_evidence_ids' };
  const unknownEvidenceId = evidenceIds.find((id) => !context.evidenceIds.has(id));
  if (unknownEvidenceId) return { ok: false, reason: `unknown_evidence:${unknownEvidenceId}` };
  const confidence = numberField(value.confidence);
  if (confidence === undefined || confidence < 0 || confidence > 1) {
    return { ok: false, reason: 'invalid_confidence' };
  }
  const reason = stringField(value.reason);
  if (!reason) return { ok: false, reason: 'missing_reason' };

  if (type === 'reply_to_thread') {
    const annotationId = stringField(value.annotationId);
    const content = stringField(value.content);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!content) return { ok: false, reason: 'missing_reply_content' };
    return {
      ok: true,
      action: { type, annotationId, content, evidenceIds, confidence, reason },
    };
  }

  if (type === 'add_annotation') {
    const anchor = isTextAnchor(value.anchor) ? value.anchor : context.addAnnotationAnchor;
    if (!anchor) return { ok: false, reason: 'invalid_anchor' };
    const thought = stringField(value.thought);
    if (!thought) return { ok: false, reason: 'missing_thought' };
    return {
      ok: true,
      action: { type, anchor, thought, evidenceIds, confidence, reason },
    };
  }

  if (type === 'create_thread_thought') {
    const annotationId = stringField(value.annotationId);
    const thought = stringField(value.thought);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!thought) return { ok: false, reason: 'missing_thought' };
    return {
      ok: true,
      action: { type, annotationId, thought, evidenceIds, confidence, reason },
    };
  }

  if (type === 'review_distillation') {
    const annotationId = stringField(value.annotationId);
    const content = stringField(value.content);
    if (!annotationId) return { ok: false, reason: 'missing_annotation_id' };
    if (context.allowedAnnotationIds && !context.allowedAnnotationIds.includes(annotationId)) {
      return { ok: false, reason: 'annotation_not_allowed' };
    }
    if (!content) return { ok: false, reason: 'missing_review_content' };
    return {
      ok: true,
      action: { type, annotationId, content, evidenceIds, confidence, reason },
    };
  }

  if (type === 'no_action') {
    if (
      hasWritableValue(value.content) ||
      hasWritableValue(value.thought) ||
      hasWritableValue(value.anchor) ||
      hasWritableValue(value.annotationId)
    ) {
      return { ok: false, reason: 'no_action_cannot_write' };
    }
    return {
      ok: true,
      action: { type, reason, evidenceIds, confidence },
    };
  }

  return { ok: false, reason: 'unknown_action_type' };
}

function requestRepair(reason: string, repairUsed: boolean) {
  if (repairUsed) return { ok: false as const, reason: `repair_failed:${reason}` };
  return { ok: true as const, reason };
}

function fallback(
  trace: AssistantRuntimeTrace,
  evidence: AssistantEvidence[],
  failureReason: string,
  repairUsed: boolean,
  now: () => string,
): AssistantRuntimeResult {
  trace.completedAt = now();
  trace.failureReason = failureReason;
  return {
    status: 'fallback',
    failureReason,
    evidence,
    trace,
    repairUsed,
  };
}

function traceStep(
  stepIndex: number,
  event: AssistantProviderEvent,
  startedAt: number,
  data: Partial<
    Pick<
      AssistantRuntimeTraceStep,
      'resultCount' | 'evidenceIds' | 'evidenceSummaries' | 'failureReason'
    >
  > = {},
): AssistantRuntimeTraceStep {
  const toolCall = event.type === 'tool_call' ? event.toolCall : undefined;
  return {
    stepIndex,
    eventType: event.type,
    toolName: toolCall?.name,
    sanitizedToolInput: toolCall ? sanitizeToolInput(toolCall.input) : undefined,
    resultCount: data.resultCount || 0,
    evidenceIds: data.evidenceIds || [],
    evidenceSummaries: data.evidenceSummaries || [],
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    failureReason: data.failureReason,
  };
}

function normalizeEvidence(
  input: AssistantToolEvidenceInput,
  options: {
    id: string;
    toolCallId: string;
    toolName: AssistantToolName;
    maxCharacters: number;
  },
): AssistantEvidence {
  return {
    ...input,
    id: options.id,
    toolCallId: options.toolCallId,
    toolName: options.toolName,
    summary: truncateText(input.summary, options.maxCharacters),
    text: input.text ? truncateText(input.text, options.maxCharacters) : undefined,
  };
}

function sanitizeToolInput(value: unknown): unknown {
  if (typeof value === 'string') return truncateText(value, 400);
  if (!isRecord(value)) {
    if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeToolInput);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 50)
      .map(([key, item]) => [key, sanitizeToolInput(item)]),
  );
}

function truncateText(text: string, maxCharacters: number) {
  if (text.length <= maxCharacters) return text;
  return `${text.slice(0, Math.max(0, maxCharacters - 1))}…`;
}

function isTextAnchor(value: unknown): value is TextAnchor {
  if (!isRecord(value)) return false;
  const start = numberField(value.start);
  const end = numberField(value.end);
  return (
    typeof value.exact === 'string' &&
    typeof value.prefix === 'string' &&
    typeof value.suffix === 'string' &&
    start !== undefined &&
    end !== undefined &&
    start <= end
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown) {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return null;
  return value;
}

function evidenceIdArray(value: Record<string, unknown>) {
  const raw = value.evidenceIds || value.evidence_ids || value.evidenceId || value.evidence_id;
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  return stringArray(raw);
}

function hasWritableValue(value: unknown) {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function addUsage(
  left: NormalizedAiUsage | undefined,
  right: NormalizedAiUsage | undefined,
): NormalizedAiUsage | undefined {
  if (!left && !right) return undefined;
  return {
    inputTokens: addUsageField(left?.inputTokens, right?.inputTokens),
    outputTokens: addUsageField(left?.outputTokens, right?.outputTokens),
    reasoningTokens: addUsageField(left?.reasoningTokens, right?.reasoningTokens),
    cachedInputTokens: addUsageField(left?.cachedInputTokens, right?.cachedInputTokens),
    cacheWriteTokens: addUsageField(left?.cacheWriteTokens, right?.cacheWriteTokens),
    totalTokens: addUsageField(left?.totalTokens, right?.totalTokens),
  };
}

function addUsageField(left: number | undefined, right: number | undefined) {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return left + right;
}

function aiSdkTool(
  toolDefinition: AssistantToolDefinition,
  context: {
    articleId: string;
    budget: AssistantRuntimeBudget;
    evidence: AssistantEvidence[];
    nextStepIndex: () => number;
    incrementStepIndex: () => void;
    onEvent?: (event: AssistantRuntimeStreamEvent) => void;
    toolsByName: Map<AssistantToolName, AssistantToolDefinition>;
    toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
    trace: AssistantRuntimeTrace;
  },
): AiSdkToolShape {
  return {
    description: toolDefinition.description || toolDefinition.name,
    inputSchema: jsonSchema(toolInputSchema(toolDefinition.name) as JSONSchema7),
    execute: async (input, options) => {
      const stepIndex = context.nextStepIndex();
      context.incrementStepIndex();
      const startedAt = performance.now();
      const toolCall: AssistantToolCall = {
        id: options.toolCallId || `tool_call_${stepIndex}`,
        name: toolDefinition.name,
        input,
      };
      context.onEvent?.({ type: 'tool_call', toolName: toolCall.name, stepIndex });
      const invalidReason = context.toolsByName.get(toolCall.name)?.validateInput?.(input) || null;
      if (invalidReason) {
        context.trace.steps.push(
          aiSdkTraceStep(stepIndex, toolCall, startedAt, {
            failureReason: invalidReason,
          }),
        );
        context.onEvent?.({
          type: 'tool_result',
          toolName: toolCall.name,
          stepIndex,
          ok: false,
        });
        throw new AssistantRuntimeFailure(invalidReason);
      }

      const result = await context.toolExecutor(toolCall);
      if (!result.ok) {
        context.trace.steps.push(
          aiSdkTraceStep(stepIndex, toolCall, startedAt, {
            failureReason: result.failureReason,
          }),
        );
        context.onEvent?.({
          type: 'tool_result',
          toolName: toolCall.name,
          stepIndex,
          ok: false,
        });
        throw new AssistantRuntimeFailure(result.failureReason);
      }

      const invalidEvidence = (result.evidence || []).find(
        (item) => item.provenance.articleId !== context.articleId,
      );
      if (invalidEvidence) {
        const failureReason = `evidence_article_mismatch:${invalidEvidence.provenance.articleId}`;
        context.trace.steps.push(
          aiSdkTraceStep(stepIndex, toolCall, startedAt, {
            failureReason,
          }),
        );
        context.onEvent?.({
          type: 'tool_result',
          toolName: toolCall.name,
          stepIndex,
          ok: false,
        });
        throw new AssistantRuntimeFailure(failureReason);
      }

      const nextEvidence = (result.evidence || [])
        .slice(0, context.budget.maxToolResults)
        .map((item, index) =>
          normalizeEvidence(item, {
            id: `evidence_${stepIndex}_${index}`,
            toolCallId: toolCall.id || `tool_call_${stepIndex}`,
            toolName: toolCall.name,
            maxCharacters: context.budget.maxToolResultCharacters,
          }),
        );
      context.evidence.push(...nextEvidence);
      context.trace.steps.push(
        aiSdkTraceStep(stepIndex, toolCall, startedAt, {
          resultCount: nextEvidence.length,
          evidenceIds: nextEvidence.map((item) => item.id),
          evidenceSummaries: nextEvidence.map((item) => ({
            id: item.id,
            summary: item.summary,
            provenance: item.provenance,
          })),
        }),
      );
      context.onEvent?.({
        type: 'tool_result',
        toolName: toolCall.name,
        stepIndex,
        ok: true,
      });
      return {
        ok: true,
        summary: result.summary,
        evidence: nextEvidence.map((item) => ({
          id: item.id,
          toolName: item.toolName,
          summary: item.summary,
          text: item.text,
          provenance: item.provenance,
        })),
      };
    },
  };
}

function aiSdkTraceStep(
  stepIndex: number,
  toolCall: AssistantToolCall,
  startedAt: number,
  data: Partial<
    Pick<
      AssistantRuntimeTraceStep,
      'resultCount' | 'evidenceIds' | 'evidenceSummaries' | 'failureReason'
    >
  > = {},
): AssistantRuntimeTraceStep {
  return {
    stepIndex,
    eventType: 'tool_call',
    toolName: toolCall.name,
    sanitizedToolInput: sanitizeToolInput(toolCall.input),
    resultCount: data.resultCount || 0,
    evidenceIds: data.evidenceIds || [],
    evidenceSummaries: data.evidenceSummaries || [],
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
    failureReason: data.failureReason,
  };
}

function finalActionFromText(
  options: AssistantAiSdkRuntimeOptions,
  text: string,
): AssistantFinalAction {
  const content = text.trim();
  const evidenceIds: string[] = [];
  const reason = 'AI SDK tool runtime final text';
  if (options.taskType === 'create_thought') {
    return {
      type: 'create_thread_thought',
      annotationId: options.allowedAnnotationIds[0] || '',
      thought: content,
      evidenceIds,
      confidence: 0.7,
      reason,
    };
  }
  if (options.taskType === 'distillation_review') {
    return {
      type: 'review_distillation',
      annotationId: options.allowedAnnotationIds[0] || '',
      content,
      evidenceIds,
      confidence: 0.7,
      reason,
    };
  }
  return {
    type: 'reply_to_thread',
    annotationId: options.allowedAnnotationIds[0] || '',
    content,
    evidenceIds,
    confidence: 0.7,
    reason,
  };
}

function emitFallback(
  options: Pick<AssistantAiSdkRuntimeOptions, 'onEvent'>,
  trace: AssistantRuntimeTrace,
  evidence: AssistantEvidence[],
  failureReason: string,
  repairUsed: boolean,
  now: () => string,
) {
  options.onEvent?.({ type: 'fallback', reason: failureReason });
  return fallback(trace, evidence, failureReason, repairUsed, now);
}

function toolInputSchema(name: AssistantToolName) {
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

function emptyToolSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [],
    properties: {},
  };
}

function queryToolSchema() {
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
