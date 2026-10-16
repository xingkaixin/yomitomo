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
