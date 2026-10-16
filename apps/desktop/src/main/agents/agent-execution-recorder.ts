import type { NormalizedAiUsage } from '@yomitomo/ai';
import { isRecord } from '@yomitomo/shared';
import type { AssistantExecutionRunInput } from '../assistant/assistant-execution-repository';

type AgentExecutionLogger = {
  logError: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export type AssistantExecutionRecorder = {
  recordFastExecution: (input: AssistantExecutionRunInput) => void;
};

export function createAssistantExecutionRecorder(input: {
  recordAssistantExecutionRun: (input: AssistantExecutionRunInput) => void | Promise<void>;
  logger: AgentExecutionLogger;
}): AssistantExecutionRecorder {
  return {
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
