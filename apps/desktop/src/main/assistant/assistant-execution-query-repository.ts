import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import type {
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionSafeStep,
  AssistantExecutionStatus,
  AssistantExecutionSummary,
  AssistantExecutionSummaryGroup,
  AssistantExecutionTotals,
  AssistantExecutionUsage,
} from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

type AssistantExecutionRow = typeof schema.assistantExecutionRuns.$inferSelect;

export function listAssistantExecutionRuns(
  database: StoreExecutor,
  input: AssistantExecutionQueryInput,
): AssistantExecutionRun[] {
  const rows = database
    .select()
    .from(schema.assistantExecutionRuns)
    .where(assistantExecutionWhere(input))
    .orderBy(desc(schema.assistantExecutionRuns.createdAt))
    .limit(normalizeLimit(input.limit))
    .all();
  return rows.map(assistantExecutionRunDto);
}

export function summarizeAssistantExecutions(
  database: StoreExecutor,
  input: AssistantExecutionQueryInput,
): AssistantExecutionSummary {
  const rows = database
    .select()
    .from(schema.assistantExecutionRuns)
    .where(assistantExecutionWhere(input))
    .all();
  return {
    totals: summarizeAssistantExecutionRows(rows),
    byAgent: groupRows(rows, (row) => ({
      key: row.agentId,
      label: agentLabel(row),
    })),
    byProviderModel: groupRows(rows, (row) => ({
      key: `${row.providerId}:${row.modelName}`,
      label: `${row.providerName} / ${row.modelName}`,
    })),
    byTaskType: groupRows(rows, (row) => ({
      key: row.taskType,
      label: row.taskType,
    })),
    byMode: groupRows(rows, (row) => ({
      key: row.effectiveMode,
      label: row.effectiveMode,
    })),
  };
}

function assistantExecutionWhere(input: AssistantExecutionQueryInput) {
  const clauses: SQL[] = [
    gte(schema.assistantExecutionRuns.createdAt, input.from),
    lte(schema.assistantExecutionRuns.createdAt, input.to),
  ];
  if (input.agentId) clauses.push(eq(schema.assistantExecutionRuns.agentId, input.agentId));
  if (input.providerId)
    clauses.push(eq(schema.assistantExecutionRuns.providerId, input.providerId));
  if (input.modelName) clauses.push(eq(schema.assistantExecutionRuns.modelName, input.modelName));
  if (input.taskType) clauses.push(eq(schema.assistantExecutionRuns.taskType, input.taskType));
  if (input.status && input.status !== 'all')
    clauses.push(eq(schema.assistantExecutionRuns.status, input.status));
  if (input.requestedMode)
    clauses.push(eq(schema.assistantExecutionRuns.requestedMode, input.requestedMode));
  if (input.effectiveMode)
    clauses.push(eq(schema.assistantExecutionRuns.effectiveMode, input.effectiveMode));
  return and(...clauses);
}

export function assistantExecutionRunDto(row: AssistantExecutionRow): AssistantExecutionRun {
  return {
    id: row.id,
    createdAt: row.createdAt,
    agentId: row.agentId,
    agentUsername: row.agentUsername || undefined,
    agentNickname: row.agentNickname || undefined,
    taskType: row.taskType,
    requestedMode: row.requestedMode,
    effectiveMode: row.effectiveMode,
    providerId: row.providerId,
    providerName: row.providerName,
    modelName: row.modelName,
    status: normalizeStatus(row.status),
    fallbackReason: row.fallbackReason || undefined,
    usage: rowUsage(row),
    estimatedCostMicros: row.estimatedCostMicros ?? undefined,
    currency: row.currency || undefined,
    durationMs: row.durationMs ?? undefined,
    stepCount: row.stepCount,
    safeSteps: safeTraceSteps(row.traceJson),
  };
}

export function summarizeAssistantExecutionRows(
  rows: AssistantExecutionRow[],
): AssistantExecutionTotals {
  const totals = emptyTotals();
  let durationCount = 0;
  let durationSum = 0;
  for (const row of rows) {
    totals.runCount += 1;
    const status = normalizeStatus(row.status);
    if (status === 'success') totals.successCount += 1;
    if (status === 'fallback') totals.fallbackCount += 1;
    if (status === 'error') totals.errorCount += 1;
    addUsage(totals.usage, rowUsage(row));
    if (row.estimatedCostMicros === null) totals.missingCostCount += 1;
    else totals.estimatedCostMicros += row.estimatedCostMicros;
    if (row.durationMs !== null) {
      durationCount += 1;
      durationSum += row.durationMs;
    }
  }
  if (durationCount > 0) totals.averageDurationMs = Math.round(durationSum / durationCount);
  return totals;
}

function groupRows(
  rows: AssistantExecutionRow[],
  groupForRow: (
    row: AssistantExecutionRow,
  ) => Pick<AssistantExecutionSummaryGroup, 'key' | 'label'>,
): AssistantExecutionSummaryGroup[] {
  const groups = new Map<string, { label: string; rows: AssistantExecutionRow[] }>();
  for (const row of rows) {
    const group = groupForRow(row);
    const existing = groups.get(group.key);
    if (existing) existing.rows.push(row);
    else groups.set(group.key, { label: group.label, rows: [row] });
  }
  return Array.from(groups.entries())
    .map(([key, group]) =>
      Object.assign(summarizeAssistantExecutionRows(group.rows), {
        key,
        label: group.label,
      }),
    )
    .toSorted((left, right) => right.estimatedCostMicros - left.estimatedCostMicros);
}

function emptyTotals(): AssistantExecutionTotals {
  return {
    runCount: 0,
    successCount: 0,
    fallbackCount: 0,
    errorCount: 0,
    usage: emptyUsage(),
    estimatedCostMicros: 0,
    missingCostCount: 0,
  };
}

function emptyUsage(): AssistantExecutionUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
  };
}

function rowUsage(row: AssistantExecutionRow): AssistantExecutionUsage {
  return {
    inputTokens: row.inputTokens || 0,
    outputTokens: row.outputTokens || 0,
    reasoningTokens: row.reasoningTokens || 0,
    cachedInputTokens: row.cachedInputTokens || 0,
    cacheWriteTokens: row.cacheWriteTokens || 0,
    totalTokens:
      row.totalTokens ||
      (row.inputTokens || 0) +
        (row.outputTokens || 0) +
        (row.reasoningTokens || 0) +
        (row.cacheWriteTokens || 0),
  };
}

function addUsage(target: AssistantExecutionUsage, next: AssistantExecutionUsage) {
  target.inputTokens += next.inputTokens;
  target.outputTokens += next.outputTokens;
  target.reasoningTokens += next.reasoningTokens;
  target.cachedInputTokens += next.cachedInputTokens;
  target.cacheWriteTokens += next.cacheWriteTokens;
  target.totalTokens += next.totalTokens;
}

function safeTraceSteps(traceJson: unknown): AssistantExecutionSafeStep[] {
  const steps = Array.isArray(recordField(traceJson, 'steps'))
    ? (recordField(traceJson, 'steps') as unknown[])
    : [];
  return steps
    .map(safeTraceStep)
    .filter((step): step is AssistantExecutionSafeStep => Boolean(step));
}

function safeTraceStep(input: unknown): AssistantExecutionSafeStep | null {
  if (!isRecord(input)) return null;
  return {
    stepIndex: numberField(input.stepIndex) || 0,
    eventType: stringField(input.eventType) || 'unknown',
    toolName: stringField(input.toolName) || undefined,
    latencyMs: numberField(input.latencyMs) || 0,
    resultCount: numberField(input.resultCount) || 0,
    failureReason: stringField(input.failureReason) || undefined,
  };
}

function normalizeStatus(value: string): AssistantExecutionStatus {
  if (value === 'fallback' || value === 'error') return value;
  return 'success';
}

function agentLabel(row: AssistantExecutionRow) {
  return row.agentNickname || (row.agentUsername ? `@${row.agentUsername}` : row.agentId);
}

function normalizeLimit(value: number | undefined) {
  if (!value || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
