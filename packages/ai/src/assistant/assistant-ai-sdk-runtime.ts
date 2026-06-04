import { jsonSchema, stepCountIs, streamText, type JSONSchema7 } from 'ai';
import { Effect } from 'effect';
import {
  createYomitomoLanguageModel,
  supportsProviderTools,
} from '../provider/ai-sdk-provider-adapter';
import { normalizeAiUsage } from '../provider/usage';
import {
  DEFAULT_ASSISTANT_RUNTIME_BUDGETS,
  type AssistantAiSdkRuntimeOptions,
  type AssistantEvidence,
  type AssistantFinalAction,
  type AssistantRuntimeBudget,
  type AssistantRuntimeResult,
  type AssistantRuntimeStreamEvent,
  type AssistantRuntimeTrace,
  type AssistantRuntimeTraceStep,
  type AssistantToolCall,
  type AssistantToolDefinition,
  type AssistantToolExecutionResult,
  type AssistantToolName,
} from './assistant-runtime-types';
import {
  AssistantRuntimeFailure,
  AssistantRuntimeProviderFailure,
  assistantRuntimeFailureReason,
} from './assistant-runtime-errors';
import { promiseEffect, toolExecutorEffect } from './assistant-runtime-effects';
import { validateAssistantFinalAction } from './assistant-runtime-validation';
import { fallback, normalizeEvidence, sanitizeToolInput } from './assistant-runtime-trace';

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

export async function runAssistantAiSdkToolRuntime(
  options: AssistantAiSdkRuntimeOptions,
): Promise<AssistantRuntimeResult> {
  return Effect.runPromise(runAssistantAiSdkToolRuntimeEffect(options));
}

function runAssistantAiSdkToolRuntimeEffect(
  options: AssistantAiSdkRuntimeOptions,
): Effect.Effect<AssistantRuntimeResult> {
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
    return Effect.succeed(
      emitFallback(options, trace, evidence, 'provider_tools_unsupported', false, now),
    );
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

  return Effect.gen(function* () {
    const result = yield* aiSdkStreamTextEffect({
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
    const text = yield* consumeRuntimeTextStreamEffect(result.textStream, options.onEvent);
    const finishReason = yield* promiseEffect(result.finishReason, AssistantRuntimeProviderFailure);
    trace.usage = normalizeAiUsage(
      yield* promiseEffect(result.totalUsage, AssistantRuntimeProviderFailure),
    );
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
      status: 'final' as const,
      action: validation.action,
      evidence,
      trace,
      repairUsed: false,
    };
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        emitFallback(options, trace, evidence, assistantRuntimeFailureReason(error), false, now),
      ),
    ),
  );
}

function firstRequiredRuntimeToolName(tools: AssistantToolDefinition[]) {
  const toolNames = new Set(tools.map((tool) => tool.name));
  if (toolNames.has('get_current_thread')) return 'get_current_thread';
  if (toolNames.has('get_anchor_context')) return 'get_anchor_context';
  return tools[0].name;
}

function aiSdkStreamTextEffect(input: Parameters<typeof streamText>[0]) {
  return Effect.try({
    try: () => streamText(input),
    catch: (error) => new AssistantRuntimeProviderFailure(error),
  });
}

function consumeRuntimeTextStreamEffect(
  textStream: AsyncIterable<string>,
  onEvent?: (event: AssistantRuntimeStreamEvent) => void,
) {
  return Effect.tryPromise({
    try: async () => {
      let text = '';
      for await (const delta of textStream) {
        text += delta;
        onEvent?.({ type: 'text_delta', delta });
      }
      return text;
    },
    catch: (error) => new AssistantRuntimeProviderFailure(error),
  });
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

      const result = await Effect.runPromise(toolExecutorEffect(context.toolExecutor, toolCall));
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
