import type { NormalizedAiUsage } from '@yomitomo/ai';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import { isRecord, normalizeAssistantExecutionMode } from '@yomitomo/shared';
import type {
  DistillationReviewRuntimeResult,
  ThreadReplyRuntimeResult,
} from './agent-message-runtime';
import type { AgentRuntimeTaskType } from './agent-runtime-routing';
import type { AssistantExecutionRunInput } from '../assistant/assistant-execution-repository';

type AgentMessageRuntimeResult = ThreadReplyRuntimeResult | DistillationReviewRuntimeResult;

type AgentExecutionLogger = {
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
  logInfo: (event: string, data?: Record<string, unknown>) => void;
};

type AgentRuntimeTraceInput = Parameters<
  typeof import('./agent-runtime-trace-log').appendAgentRuntimeTrace
>[0];

export type AssistantExecutionRecorder = {
  recordRuntimeExecution: (input: RuntimeExecutionRecord) => void;
  recordFastExecution: (input: AssistantExecutionRunInput) => void;
};

export type RuntimeExecutionRecord = {
  result: AgentMessageRuntimeResult;
  provider: LlmProvider;
  agent: Agent;
  requestedMode: ReturnType<typeof normalizeAssistantExecutionMode>;
  taskType: AgentRuntimeTaskType;
  durationMs?: number;
};

export function createAssistantExecutionRecorder(input: {
  appendRuntimeTrace: (input: AgentRuntimeTraceInput) => void | Promise<void>;
  recordAssistantExecutionRun: (input: AssistantExecutionRunInput) => void | Promise<void>;
  logger: AgentExecutionLogger;
}): AssistantExecutionRecorder {
  return {
    recordRuntimeExecution: (record) => recordRuntimeExecution(input, record),
    recordFastExecution: (record) => {
      safelyRecordExecutionRun(input.recordAssistantExecutionRun, input.logger, record);
    },
  };
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

function recordRuntimeExecution(
  sinks: Parameters<typeof createAssistantExecutionRecorder>[0],
  input: RuntimeExecutionRecord,
) {
  const { result } = input;
  if (result.status === 'comment' || result.status === 'message') {
    logInfo(sinks.logger, `assistant_runtime.${input.taskType}`, {
      status: result.status,
      stepCount: result.runtime.trace.steps.length,
      finalActionType: result.runtime.trace.finalActionType,
      repairUsed: result.runtime.repairUsed,
    });
    safelyAppendRuntimeTrace(sinks.appendRuntimeTrace, sinks.logger, {
      taskType: input.taskType,
      agentId: result.runtime.trace.agentId,
      articleId: result.runtime.trace.articleId,
      runtimeStatus: result.runtime.status,
      finalActionType: result.runtime.trace.finalActionType,
      stepCount: result.runtime.trace.steps.length,
      repairUsed: result.runtime.repairUsed,
      trace: result.runtime.trace,
    });
    safelyRecordExecutionRun(
      sinks.recordAssistantExecutionRun,
      sinks.logger,
      inputFromRuntime(input, 'success'),
    );
    return;
  }

  logInfo(sinks.logger, `assistant_runtime.${input.taskType}`, {
    status: 'fallback',
    failureReason: result.failureReason,
    stepCount: result.runtime?.trace.steps.length,
    finalActionType: result.runtime?.trace.finalActionType,
  });
  if (!result.runtime) return;
  safelyAppendRuntimeTrace(sinks.appendRuntimeTrace, sinks.logger, {
    taskType: input.taskType,
    agentId: result.runtime.trace.agentId,
    articleId: result.runtime.trace.articleId,
    runtimeStatus: result.runtime.status,
    failureReason: result.failureReason,
    finalActionType: result.runtime.trace.finalActionType,
    stepCount: result.runtime.trace.steps.length,
    repairUsed: result.runtime.repairUsed,
    trace: result.runtime.trace,
  });
  safelyRecordExecutionRun(
    sinks.recordAssistantExecutionRun,
    sinks.logger,
    inputFromRuntime(input, 'fallback'),
  );
}

function inputFromRuntime(
  input: RuntimeExecutionRecord,
  status: 'success' | 'fallback',
): AssistantExecutionRunInput {
  const runtime = input.result.runtime;
  if (!runtime) throw new Error('runtime execution record requires runtime result');
  return {
    agent: input.agent,
    provider: input.provider,
    taskType: input.taskType,
    requestedMode: input.requestedMode,
    effectiveMode: 'deep_verification',
    status,
    fallbackReason:
      status === 'fallback' && input.result.status === 'fallback'
        ? input.result.failureReason
        : undefined,
    usage: runtime.trace.usage,
    durationMs: input.durationMs,
    stepCount: runtime.trace.steps.length,
    traceJson: runtime.trace,
  };
}

function safelyAppendRuntimeTrace(
  appendRuntimeTrace: (input: AgentRuntimeTraceInput) => void | Promise<void>,
  logger: AgentExecutionLogger,
  input: AgentRuntimeTraceInput,
) {
  safelyRun(
    () => appendRuntimeTrace(input),
    (error) => logError(logger, 'assistant_runtime.trace_write_failed', error),
  );
}

function safelyRecordExecutionRun(
  recordAssistantExecutionRun: (input: AssistantExecutionRunInput) => void | Promise<void>,
  logger: AgentExecutionLogger,
  input: AssistantExecutionRunInput,
) {
  safelyRun(
    () => recordAssistantExecutionRun(input),
    (error) => logError(logger, 'assistant.execution_run_write_failed', error),
  );
}

function safelyRun(action: () => void | Promise<void>, onError: (error: unknown) => void) {
  try {
    Promise.resolve(action()).catch(onError);
  } catch (error) {
    onError(error);
  }
}

function logInfo(logger: AgentExecutionLogger, event: string, data: Record<string, unknown>) {
  try {
    logger.logInfo(event, data);
  } catch {
    return;
  }
}

function logError(logger: AgentExecutionLogger, event: string, error: unknown) {
  try {
    logger.logError(event, error);
  } catch {
    return;
  }
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
