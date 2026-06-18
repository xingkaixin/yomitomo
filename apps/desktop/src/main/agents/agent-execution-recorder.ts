import type { Agent, LlmProvider } from '@yomitomo/shared';
import { normalizeAssistantExecutionMode } from '@yomitomo/shared';
import type { NormalizedAiUsage } from '@yomitomo/ai';
import type {
  DistillationReviewRuntimeResult,
  ThreadReplyRuntimeResult,
} from './agent-thread-runtime';
import { appendAgentRuntimeTrace } from './agent-runtime-trace-log';
import type { DesktopMainIpcContext } from '../ipc/ipc';
import type { AgentRuntimeTaskType } from './agent-runtime-routing';
import type { AssistantExecutionRunInput } from '../assistant/assistant-execution-repository';

export function logAgentMessageRuntime(
  context: DesktopMainIpcContext,
  result: ThreadReplyRuntimeResult | DistillationReviewRuntimeResult,
  provider: LlmProvider,
  agent: Agent,
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>,
  taskType: AgentRuntimeTaskType,
  durationMs?: number,
) {
  if (result.status === 'comment' || result.status === 'message') {
    context.logInfo(`assistant_runtime.${taskType}`, {
      status: result.status,
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    void appendAgentRuntimeTrace({
      taskType,
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: result.status === 'comment' ? 'comment' : 'result',
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType,
      requestedMode,
      effectiveMode: 'deep_verification',
      status: 'success',
      usage: result.runtime.trace.usage,
      durationMs,
      stepCount: result.runtime.trace.steps.length,
      traceJson: result.runtime.trace,
    });
    return;
  }
  context.logInfo(`assistant_runtime.${taskType}`, {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: result.runtime?.trace.steps.length,
    finalActionType: result.runtime?.trace.finalActionType,
  });
  if (result.runtime) {
    void appendAgentRuntimeTrace({
      taskType,
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      status: 'fallback',
      failureReason: result.failureReason,
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    }).catch((error) => context.logError('assistant_runtime.trace_write_failed', error));
    recordAssistantExecutionRun(context, {
      agent,
      provider,
      taskType,
      requestedMode,
      effectiveMode: 'deep_verification',
      status: 'fallback',
      fallbackReason: result.failureReason,
      usage: result.runtime.trace.usage,
      durationMs,
      stepCount: result.runtime.trace.steps.length,
      traceJson: result.runtime.trace,
    });
  }
}

export function recordAssistantExecutionRun(
  context: DesktopMainIpcContext,
  input: AssistantExecutionRunInput,
) {
  void context
    .getPersistenceModule()
    .then(({ assistantExecutionPersistence }) =>
      assistantExecutionPersistence.recordAssistantExecutionRun(input),
    )
    .catch((error) => context.logError('assistant.execution_run_write_failed', error));
}

export function annotateResultUsage(result: unknown): NormalizedAiUsage | undefined {
  if (!isRecord(result) || !isRecord(result.usage)) return undefined;
  return compactUsage({
    inputTokens: finiteNumber(result.usage.inputTokens),
    outputTokens: finiteNumber(result.usage.outputTokens),
    reasoningTokens: finiteNumber(result.usage.reasoningTokens),
    cachedInputTokens: finiteNumber(result.usage.cachedInputTokens),
    cacheWriteTokens: finiteNumber(result.usage.cacheWriteTokens),
    totalTokens: finiteNumber(result.usage.totalTokens),
  });
}

function compactUsage(usage: NormalizedAiUsage) {
  const compacted = Object.fromEntries(
    Object.entries(usage).filter(([, value]) => value !== undefined),
  ) as NormalizedAiUsage;
  return Object.keys(compacted).length > 0 ? compacted : undefined;
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
