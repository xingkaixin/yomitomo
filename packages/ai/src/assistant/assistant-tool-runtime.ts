import { Effect } from 'effect';
import {
  DEFAULT_ASSISTANT_RUNTIME_BUDGETS,
  type AssistantRuntimeOptions,
  type AssistantRuntimeResult,
} from './assistant-runtime-types';
import { AssistantRuntimeToolFailure } from './assistant-runtime-errors';
import { modelAdapterEffect } from './assistant-runtime-effects';
import { createAssistantRuntimeKernel } from './assistant-runtime-kernel';

export async function runAssistantToolRuntime(
  options: AssistantRuntimeOptions,
): Promise<AssistantRuntimeResult> {
  return Effect.runPromise(runAssistantToolRuntimeEffect(options));
}

export const runAssistantToolRuntimeEffect = Effect.fn('Assistant.runToolRuntime')(function* (
  options: AssistantRuntimeOptions,
) {
  const budget = { ...DEFAULT_ASSISTANT_RUNTIME_BUDGETS[options.taskType], ...options.budget };
  const kernel = createAssistantRuntimeKernel({ ...options, budget });

  for (let stepIndex = 0; stepIndex < budget.maxSteps; stepIndex += 1) {
    const startedAt = performance.now();
    const event = yield* modelAdapterEffect(options.modelAdapter, {
      ...kernel.turn(stepIndex),
    });
    kernel.addEventUsage(event.usage);
    kernel.consumeRepairReason();

    if (event.type === 'tool_call') {
      const step = yield* Effect.tryPromise({
        try: () =>
          kernel.handleToolCall(
            stepIndex,
            event,
            startedAt,
            () => options.toolExecutor(event.toolCall),
            { repairable: true },
          ),
        catch: (error) => new AssistantRuntimeToolFailure(error),
      });
      if (step.type === 'fallback' || step.type === 'final') return step.result;
      continue;
    }

    if (event.type === 'final_action') {
      const step = kernel.handleFinalAction(stepIndex, event, startedAt, { repairable: true });
      if (step.type === 'fallback' || step.type === 'final') return step.result;
      continue;
    }

    const step = kernel.handleProviderFailure(stepIndex, event, startedAt);
    if (step.type === 'fallback') return step.result;
  }

  return kernel.finishWithFallback('step_limit_exceeded');
});
