import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import { makeId } from '@yomitomo/shared';
import type { AgentRuntimeTraceEntry, AgentRuntimeTraceListInput } from '../ipc-contract';

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
    const parsed = JSON.parse(line) as AgentRuntimeTraceEntry;
    return isAgentRuntimeTraceEntry(parsed) ? [parsed] : [];
  } catch {
    return [];
  }
}

function isAgentRuntimeTraceEntry(value: unknown): value is AgentRuntimeTraceEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AgentRuntimeTraceEntry>;
  return (
    typeof entry.id === 'string' &&
    typeof entry.at === 'string' &&
    isTraceTaskType(entry.taskType) &&
    typeof entry.agentId === 'string' &&
    typeof entry.articleId === 'string' &&
    typeof entry.status === 'string' &&
    typeof entry.stepCount === 'number'
  );
}

function isTraceTaskType(value: unknown) {
  return value === 'thread_reply' || value === 'selection_first' || value === 'co_reading_section';
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
