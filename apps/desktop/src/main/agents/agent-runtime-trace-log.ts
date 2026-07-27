import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { assistantRuntimeTaskTypes, isRecord, makeId } from '@yomitomo/shared';
import type {
  AgentRuntimeTraceDecision,
  AgentRuntimeTraceEntry,
  AgentRuntimeTraceListInput,
  AssistantRuntimeResultStatus,
} from '../../ipc-contract';

const TRACE_FILE_NAME = 'yomitomo-agent-trace.jsonl';
const DEFAULT_TRACE_LIMIT = 100;
const MAX_TRACE_LIMIT = 500;

export function getAgentRuntimeTracePath() {
  return join(app.getPath('userData'), TRACE_FILE_NAME);
}

export async function appendAgentRuntimeTrace(
  input: Omit<AgentRuntimeTraceEntry, 'id' | 'at'> &
    Partial<Pick<AgentRuntimeTraceEntry, 'id' | 'at'>>,
) {
  const entry: AgentRuntimeTraceEntry = {
    ...input,
    id: input.id || makeId('trace'),
    at: input.at || new Date().toISOString(),
  };
  await ensureTraceFile();
  await appendFile(getAgentRuntimeTracePath(), `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function readAgentRuntimeTraces(input: AgentRuntimeTraceListInput = {}) {
  await ensureTraceFile();
  const content = await readFile(getAgentRuntimeTracePath(), 'utf8');
  const limit = normalizeTraceLimit(input.limit);
  return content
    .split('\n')
    .flatMap(parseTraceLine)
    .filter((entry) => traceMatchesFilters(entry, input))
    .toSorted((left, right) => Date.parse(right.at) - Date.parse(left.at))
    .slice(0, limit);
}

export async function clearAgentRuntimeTraces() {
  await ensureTraceFile();
  await writeFile(getAgentRuntimeTracePath(), '', 'utf8');
}

async function ensureTraceFile() {
  await mkdir(dirname(getAgentRuntimeTracePath()), { recursive: true });
  await appendFile(getAgentRuntimeTracePath(), '', 'utf8');
}

function parseTraceLine(line: string): AgentRuntimeTraceEntry[] {
  if (!line.trim()) return [];
  try {
    const parsed = JSON.parse(line) as unknown;
    const entry = normalizeAgentRuntimeTraceEntry(parsed);
    return entry ? [entry] : [];
  } catch {
    return [];
  }
}

function normalizeAgentRuntimeTraceEntry(value: unknown): AgentRuntimeTraceEntry | null {
  if (!isRecord(value) || !isTraceTaskType(value.taskType)) return null;
  const runtimeStatus = normalizeRuntimeStatus(value.runtimeStatus ?? value.status);
  if (
    !runtimeStatus ||
    typeof value.id !== 'string' ||
    typeof value.at !== 'string' ||
    typeof value.agentId !== 'string' ||
    typeof value.articleId !== 'string' ||
    !isFiniteNumber(value.stepCount)
  ) {
    return null;
  }

  const entry: AgentRuntimeTraceEntry = {
    id: value.id,
    at: value.at,
    taskType: value.taskType,
    agentId: value.agentId,
    articleId: value.articleId,
    runtimeStatus,
    stepCount: value.stepCount,
  };
  if (typeof value.finalActionType === 'string') entry.finalActionType = value.finalActionType;
  if (typeof value.failureReason === 'string') entry.failureReason = value.failureReason;
  if (typeof value.repairUsed === 'boolean') entry.repairUsed = value.repairUsed;
  if (isFiniteNumber(value.annotationCount)) entry.annotationCount = value.annotationCount;
  if (isFiniteNumber(value.decisionCount)) entry.decisionCount = value.decisionCount;
  if (isFiniteNumber(value.filteredCount)) entry.filteredCount = value.filteredCount;
  if (isFiniteNumber(value.fallbackCount)) entry.fallbackCount = value.fallbackCount;
  if ('trace' in value) entry.trace = value.trace;
  if (Array.isArray(value.decisions)) {
    entry.decisions = value.decisions.flatMap((decision) => {
      const normalized = normalizeTraceDecision(decision);
      return normalized ? [normalized] : [];
    });
  }
  return entry;
}

function normalizeTraceDecision(value: unknown): AgentRuntimeTraceDecision | null {
  if (!isRecord(value) || typeof value.annotationId !== 'string') return null;
  const runtimeStatus = normalizeRuntimeStatus(value.runtimeStatus ?? value.status);
  const retention = normalizeRetention(value, runtimeStatus);
  if (!retention) return null;

  const decision: AgentRuntimeTraceDecision = {
    annotationId: value.annotationId,
    retention,
  };
  if (runtimeStatus) decision.runtimeStatus = runtimeStatus;
  if (typeof value.actionType === 'string') decision.actionType = value.actionType;
  if (typeof value.failureReason === 'string') decision.failureReason = value.failureReason;
  return decision;
}

function normalizeRuntimeStatus(value: unknown): AssistantRuntimeResultStatus | undefined {
  if (value === 'fallback') return 'fallback';
  if (value === 'final' || value === 'comment' || value === 'result') return 'final';
  return undefined;
}

function normalizeRetention(
  value: Record<string, unknown>,
  runtimeStatus: AssistantRuntimeResultStatus | undefined,
): AgentRuntimeTraceDecision['retention'] | undefined {
  if (value.retention === 'kept' || value.retention === 'filtered') return value.retention;
  if (value.status === 'kept_without_runtime' || runtimeStatus === 'fallback') return 'kept';
  if (runtimeStatus === 'final') return value.actionType === 'no_action' ? 'filtered' : 'kept';
  return undefined;
}

function isTraceTaskType(value: unknown): value is AgentRuntimeTraceEntry['taskType'] {
  return assistantRuntimeTaskTypes.some((taskType) => taskType === value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function traceMatchesFilters(entry: AgentRuntimeTraceEntry, input: AgentRuntimeTraceListInput) {
  const taskType = input.taskType || 'all';
  if (taskType !== 'all' && entry.taskType !== taskType) return false;
  if (input.agentId?.trim() && !entry.agentId.includes(input.agentId.trim())) return false;
  if (input.articleId?.trim() && !entry.articleId.includes(input.articleId.trim())) return false;
  if (input.failureOnly && !entry.failureReason && !entry.fallbackCount) return false;
  return true;
}

function normalizeTraceLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit <= 0) return DEFAULT_TRACE_LIMIT;
  return Math.min(limit, MAX_TRACE_LIMIT);
}
