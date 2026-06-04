import { Effect } from 'effect';
import {
  DEFAULT_ASSISTANT_RUNTIME_BUDGETS,
  type AssistantEvidence,
  type AssistantRuntimeOptions,
  type AssistantRuntimeResult,
  type AssistantRuntimeTrace,
  type AssistantToolResultMessage,
} from './assistant-runtime-types';
import {
  AssistantRuntimeProviderFailure,
  AssistantRuntimeToolFailure,
} from './assistant-runtime-errors';
import { modelAdapterEffect, toolExecutorEffect } from './assistant-runtime-effects';
import { validateAssistantFinalAction } from './assistant-runtime-validation';
import {
  addUsage,
  fallback,
  normalizeEvidence,
  requestRepair,
  traceStep,
} from './assistant-runtime-trace';

export async function runAssistantToolRuntime(
  options: AssistantRuntimeOptions,
): Promise<AssistantRuntimeResult> {
  return Effect.runPromise(runAssistantToolRuntimeEffect(options));
}

function runAssistantToolRuntimeEffect(
  options: AssistantRuntimeOptions,
): Effect.Effect<
  AssistantRuntimeResult,
  AssistantRuntimeProviderFailure | AssistantRuntimeToolFailure
> {
  return Effect.gen(function* () {
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
      const event = yield* modelAdapterEffect(options.modelAdapter, {
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

        const result = yield* toolExecutorEffect(options.toolExecutor, event.toolCall);
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
  });
}
