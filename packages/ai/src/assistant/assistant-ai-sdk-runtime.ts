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
  type AssistantFinalAction,
  type AssistantRuntimeResult,
  type AssistantRuntimeStreamEvent,
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
import {
  collectDistillationReviewItemsFromElementStream,
  collectDistillationReviewItemsFromJsonTextStream,
  distillationReviewContentFromItems,
  distillationReviewProposalsFromItems,
  distillationReviewStructuredOutput,
  distillationReviewStructuredOutputPrompt,
  type GeneratedDistillationReviewItem,
} from './distillation-review-structured-output';
import { promiseEffect, toolExecutorEffect } from './assistant-runtime-effects';
import {
  createAssistantRuntimeKernel,
  type AssistantRuntimeKernel,
} from './assistant-runtime-kernel';

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
  const kernel = createAssistantRuntimeKernel({ ...options, budget, now });
  let nextStepIndex = 0;

  if (!supportsProviderTools(options.provider)) {
    return Effect.succeed(
      emitFallback(options, kernel.finishWithFallback('provider_tools_unsupported')),
    );
  }

  const adapter = createYomitomoLanguageModel(options.provider);
  const useStructuredDistillationReview = options.taskType === 'distillation_review';
  const distillationReviewUsesJsonlFallback =
    useStructuredDistillationReview && !adapter.supportsStructuredOutput;
  const aiSdkTools = Object.fromEntries(
    options.tools.map((toolDefinition) => [
      toolDefinition.name,
      aiSdkTool(toolDefinition, {
        kernel,
        nextStepIndex: () => nextStepIndex,
        incrementStepIndex: () => {
          nextStepIndex += 1;
        },
        onEvent: options.onEvent,
        toolExecutor: options.toolExecutor,
      }),
    ]),
  ) as Record<string, AiSdkToolShape>;

  return Effect.gen(function* () {
    const result = yield* aiSdkStreamTextEffect({
      model: adapter.model,
      system: options.payload.system,
      prompt: useStructuredDistillationReview
        ? `${options.payload.user}\n\n${distillationReviewStructuredOutputPrompt({
            jsonlFallback: distillationReviewUsesJsonlFallback,
            mode: options.payload.distillationReviewMode,
          })}`
        : options.payload.user,
      maxOutputTokens: options.payload.maxTokens,
      temperature: options.payload.temperature,
      providerOptions: adapter.providerOptions,
      tools: aiSdkTools,
      stopWhen: stepCountIs(
        useStructuredDistillationReview ? budget.maxSteps + 1 : budget.maxSteps,
      ),
      output:
        useStructuredDistillationReview && adapter.supportsStructuredOutput
          ? distillationReviewStructuredOutput
          : undefined,
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
    const action = useStructuredDistillationReview
      ? yield* consumeDistillationReviewStructuredOutputEffect({
          result,
          annotationId: options.allowedAnnotationIds[0] || '',
          onEvent: options.onEvent,
          now,
          structuredOutput: adapter.supportsStructuredOutput,
        })
      : finalActionFromText(
          options,
          yield* consumeRuntimeTextStreamEffect(result.textStream, options.onEvent),
        );
    const finishReason = yield* promiseEffect(result.finishReason, AssistantRuntimeProviderFailure);
    kernel.setUsage(
      normalizeAiUsage(yield* promiseEffect(result.totalUsage, AssistantRuntimeProviderFailure)),
    );
    if (finishReason === 'length') {
      return emitFallback(
        options,
        kernel.finishWithFallback(`model_output_reached_max_tokens:${options.payload.maxTokens}`),
      );
    }

    const step = kernel.handleFinalAction(
      nextStepIndex,
      { type: 'final_action', action },
      performance.now(),
      { repairable: false },
    );
    if (step.type === 'fallback') return emitFallback(options, step.result);
    if (step.type === 'final') {
      options.onEvent?.({ type: 'done', usage: step.result.trace.usage, trace: step.result.trace });
      return step.result;
    }
    return emitFallback(options, kernel.finishWithFallback(`unexpected_kernel_step:${step.type}`));
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed(
        emitFallback(options, kernel.finishWithFallback(assistantRuntimeFailureReason(error))),
      ),
    ),
  );
}

function consumeDistillationReviewStructuredOutputEffect(input: {
  result: ReturnType<typeof streamText>;
  annotationId: string;
  onEvent?: (event: AssistantRuntimeStreamEvent) => void;
  now: () => string;
  structuredOutput: boolean;
}) {
  return Effect.tryPromise({
    try: async (): Promise<AssistantFinalAction> => {
      const items = input.structuredOutput
        ? await collectDistillationReviewItemsFromElementStream({
            elementStream: input.result
              .elementStream as AsyncIterable<GeneratedDistillationReviewItem>,
            onItem: (item) => input.onEvent?.({ type: 'distillation_review_item', item }),
            now: input.now,
          })
        : await collectDistillationReviewItemsFromJsonTextStream({
            textStream: input.result.textStream,
            onItem: (item) => input.onEvent?.({ type: 'distillation_review_item', item }),
            now: input.now,
          });
      if (input.structuredOutput) await Promise.resolve(input.result.output);
      const content = distillationReviewContentFromItems(items);
      if (!content) throw new Error('Provider returned no distillation review items');
      return {
        type: 'review_distillation',
        annotationId: input.annotationId,
        content,
        items,
        proposals: distillationReviewProposalsFromItems(items),
        evidenceIds: [],
        confidence: 0.7,
        reason: 'AI SDK structured distillation review',
      };
    },
    catch: (error) => new AssistantRuntimeProviderFailure(error),
  });
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
    kernel: AssistantRuntimeKernel;
    nextStepIndex: () => number;
    incrementStepIndex: () => void;
    onEvent?: (event: AssistantRuntimeStreamEvent) => void;
    toolExecutor: (toolCall: AssistantToolCall) => Promise<AssistantToolExecutionResult>;
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
      const step = await context.kernel.handleToolCall(
        stepIndex,
        { type: 'tool_call', toolCall },
        startedAt,
        () => Effect.runPromise(toolExecutorEffect(context.toolExecutor, toolCall)),
        { repairable: false },
      );
      context.onEvent?.({
        type: 'tool_result',
        toolName: toolCall.name,
        stepIndex,
        ok: step.type === 'continue',
      });
      if (step.type !== 'continue') {
        const failureReason =
          step.type === 'fallback'
            ? step.result.failureReason
            : `unexpected_kernel_step:${step.type}`;
        throw new AssistantRuntimeFailure(failureReason);
      }
      return {
        ok: true,
        summary: step.toolResult.summary,
        evidence: step.toolResult.evidence.map((item) => ({
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
  result: Extract<AssistantRuntimeResult, { status: 'fallback' }>,
) {
  options.onEvent?.({ type: 'fallback', reason: result.failureReason });
  return result;
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
