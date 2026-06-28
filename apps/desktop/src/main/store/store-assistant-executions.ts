import {
  insertAssistantExecutionRun,
  type AssistantExecutionRunInput,
} from '../assistant/assistant-execution-repository';
import {
  getAssistantExecutionRunDetail,
  listAssistantExecutionRuns,
  summarizeAssistantExecutions,
} from '../assistant/assistant-execution-query-repository';
import type { AssistantExecutionQueryInput } from '../../ipc-contract';
import { getDatabase } from './store-db';

export function recordAssistantExecutionRun(input: AssistantExecutionRunInput) {
  insertAssistantExecutionRun(getDatabase(), input);
}

export function queryAssistantExecutionRuns(input: AssistantExecutionQueryInput) {
  return listAssistantExecutionRuns(getDatabase(), input);
}

export function queryAssistantExecutionRunDetail(id: string) {
  return getAssistantExecutionRunDetail(getDatabase(), id);
}

export function queryAssistantExecutionSummary(input: AssistantExecutionQueryInput) {
  return summarizeAssistantExecutions(getDatabase(), input);
}
