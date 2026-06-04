import type { NormalizedAiUsage } from '../provider/usage';
import type {
  AssistantEvidence,
  AssistantProviderFailureEvent,
  AssistantProviderFinalActionEvent,
  AssistantProviderInvalidResponseEvent,
  AssistantProviderToolCallEvent,
  AssistantRuntimeBudget,
  AssistantRuntimeOptions,
  AssistantRuntimeResult,
  AssistantRuntimeTrace,
  AssistantRuntimeTraceStep,
  AssistantRuntimeTurn,
  AssistantToolExecutionResult,
  AssistantToolResultMessage,
} from './assistant-runtime-types';
import { validateAssistantFinalAction } from './assistant-runtime-validation';
import {
  addUsage,
  fallback,
  normalizeEvidence,
  requestRepair,
  traceStep,
} from './assistant-runtime-trace';

export type AssistantRuntimeKernel = ReturnType<typeof createAssistantRuntimeKernel>;

export function createAssistantRuntimeKernel(
  options: Pick<
    AssistantRuntimeOptions,
    | 'taskType'
    | 'articleId'
    | 'agentId'
    | 'tools'
    | 'allowedAnnotationIds'
    | 'addAnnotationAnchor'
    | 'now'
  > & {
    budget: AssistantRuntimeBudget;
  },
) {
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

  function turn(stepIndex: number): AssistantRuntimeTurn {
    return {
      taskType: options.taskType,
      articleId: options.articleId,
      agentId: options.agentId,
      stepIndex,
      availableTools: options.tools,
      evidence,
      toolResults,
      repairReason,
    };
  }

  function consumeRepairReason() {
    repairReason = undefined;
  }

  function addEventUsage(usage: NormalizedAiUsage | undefined) {
    trace.usage = addUsage(trace.usage, usage);
  }

  async function handleToolCall(
    stepIndex: number,
    event: AssistantProviderToolCallEvent,
    startedAt: number,
    executeTool: () => Promise<AssistantToolExecutionResult>,
    settings: { repairable: boolean },
  ): Promise<AssistantRuntimeKernelStep> {
    const toolCallId = event.toolCall.id || `tool_call_${stepIndex}`;
    const tool = toolsByName.get(event.toolCall.name);
    const invalidReason =
      tool?.validateInput?.(event.toolCall.input) ||
      (!tool ? `unknown_tool:${event.toolCall.name}` : null);
    if (invalidReason) {
      const result = failedToolResult(toolCallId, event.toolCall.name, invalidReason);
      toolResults.push(result);
      trace.steps.push(traceStep(stepIndex, event, startedAt, { failureReason: invalidReason }));
      return repairOrFallback(invalidReason, settings.repairable);
    }

    const result = await executeTool();
    if (!result.ok) {
      trace.steps.push(
        traceStep(stepIndex, event, startedAt, {
          failureReason: result.failureReason,
        }),
      );
      return fallbackStep(result.failureReason);
    }

    const invalidEvidence = (result.evidence || []).find(
      (item) => item.provenance.articleId !== options.articleId,
    );
    if (invalidEvidence) {
      const failureReason = `evidence_article_mismatch:${invalidEvidence.provenance.articleId}`;
      trace.steps.push(traceStep(stepIndex, event, startedAt, { failureReason }));
      return fallbackStep(failureReason);
    }

    const nextEvidence = (result.evidence || [])
      .slice(0, options.budget.maxToolResults)
      .map((item, index) =>
        normalizeEvidence(item, {
          id: `evidence_${stepIndex}_${index}`,
          toolCallId,
          toolName: event.toolCall.name,
          maxCharacters: options.budget.maxToolResultCharacters,
        }),
      );
    evidence.push(...nextEvidence);
    const toolResult: AssistantToolResultMessage = {
      toolCallId,
      toolName: event.toolCall.name,
      ok: true,
      summary: result.summary,
      evidenceIds: nextEvidence.map((item) => item.id),
      evidence: nextEvidence,
    };
    toolResults.push(toolResult);
    trace.steps.push(
      traceStep(stepIndex, event, startedAt, {
        resultCount: nextEvidence.length,
        evidenceIds: nextEvidence.map((item) => item.id),
        evidenceSummaries: evidenceSummaries(nextEvidence),
      }),
    );
    return { type: 'continue', toolResult };
  }

  function handleFinalAction(
    stepIndex: number,
    event: AssistantProviderFinalActionEvent,
    startedAt: number,
    settings: { repairable: boolean },
  ): AssistantRuntimeKernelStep {
    const validation = validateAssistantFinalAction(event.action, {
      articleId: options.articleId,
      evidenceIds: new Set(evidence.map((item) => item.id)),
      allowedAnnotationIds: options.allowedAnnotationIds,
      addAnnotationAnchor: options.addAnnotationAnchor,
    });
    if (!validation.ok) {
      trace.steps.push(
        traceStep(stepIndex, event, startedAt, { failureReason: validation.reason }),
      );
      return repairOrFallback(validation.reason, settings.repairable);
    }

    trace.steps.push(traceStep(stepIndex, event, startedAt));
    trace.completedAt = now();
    trace.finalActionType = validation.action.type;
    return {
      type: 'final',
      result: {
        status: 'final',
        action: validation.action,
        evidence,
        trace,
        repairUsed,
      },
    };
  }

  function handleProviderFailure(
    stepIndex: number,
    event: AssistantProviderFailureEvent | AssistantProviderInvalidResponseEvent,
    startedAt: number,
  ): AssistantRuntimeKernelStep {
    trace.steps.push(traceStep(stepIndex, event, startedAt, { failureReason: event.reason }));
    if (event.type === 'invalid_response') return repairOrFallback(event.reason, true);
    return fallbackStep(event.reason);
  }

  function finishWithFallback(reason: string) {
    return fallbackStep(reason).result;
  }

  function setUsage(usage: NormalizedAiUsage | undefined) {
    trace.usage = usage;
  }

  function repairOrFallback(reason: string, repairable: boolean): AssistantRuntimeKernelStep {
    if (!repairable) return fallbackStep(reason);
    const repair = requestRepair(reason, repairUsed);
    if (!repair.ok) return fallbackStep(repair.reason);
    repairUsed = true;
    repairReason = repair.reason;
    return { type: 'repair', reason: repair.reason };
  }

  function fallbackStep(reason: string): Extract<AssistantRuntimeKernelStep, { type: 'fallback' }> {
    return {
      type: 'fallback',
      result: fallback(trace, evidence, reason, repairUsed, now) as Extract<
        AssistantRuntimeResult,
        { status: 'fallback' }
      >,
    };
  }

  return {
    addEventUsage,
    consumeRepairReason,
    evidence,
    finishWithFallback,
    handleFinalAction,
    handleProviderFailure,
    handleToolCall,
    setUsage,
    trace,
    turn,
  };
}

type AssistantRuntimeKernelStep =
  | {
      type: 'continue';
      toolResult: AssistantToolResultMessage;
    }
  | {
      type: 'repair';
      reason: string;
    }
  | {
      type: 'final';
      result: Extract<AssistantRuntimeResult, { status: 'final' }>;
    }
  | {
      type: 'fallback';
      result: Extract<AssistantRuntimeResult, { status: 'fallback' }>;
    };

function failedToolResult(
  toolCallId: string,
  toolName: AssistantToolResultMessage['toolName'],
  failureReason: string,
): AssistantToolResultMessage {
  return {
    toolCallId,
    toolName,
    ok: false,
    failureReason,
    evidenceIds: [],
    evidence: [],
  };
}

function evidenceSummaries(
  evidence: AssistantEvidence[],
): AssistantRuntimeTraceStep['evidenceSummaries'] {
  return evidence.map((item) => ({
    id: item.id,
    summary: item.summary,
    provenance: item.provenance,
  }));
}
