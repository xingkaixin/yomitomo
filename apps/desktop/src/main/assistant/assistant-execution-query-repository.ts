import { and, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type {
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionRunDetail,
  AssistantExecutionRunListItem,
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
type AssistantExecutionListRow = Omit<AssistantExecutionRow, 'traceJson'>;
type AssistantExecutionTraceRow = Pick<AssistantExecutionRow, 'id' | 'traceJson'>;
type AssistantExecutionUsageRow = Pick<
  AssistantExecutionRow,
  | 'inputTokens'
  | 'outputTokens'
  | 'reasoningTokens'
  | 'cachedInputTokens'
  | 'cacheWriteTokens'
  | 'totalTokens'
>;
type AssistantExecutionTotalsAccumulator = {
  totals: AssistantExecutionTotals;
  durationCount: number;
  durationSum: number;
};
type AssistantExecutionAggregateRow = AssistantExecutionUsage &
  Omit<AssistantExecutionTotals, 'averageDurationMs' | 'usage'> & {
    averageDurationMs: number | null;
  };

export function listAssistantExecutionRuns(
  database: StoreExecutor,
  input: AssistantExecutionQueryInput,
): AssistantExecutionRunListItem[] {
  const rows = database
    .select(assistantExecutionListSelection())
    .from(schema.assistantExecutionRuns)
    .where(assistantExecutionWhere(input))
    .orderBy(desc(schema.assistantExecutionRuns.createdAt))
    .limit(normalizeLimit(input.limit))
    .all();
  return rows.map(assistantExecutionRunListItemDto);
}

export function getAssistantExecutionRunDetail(
  database: StoreExecutor,
  id: string,
): AssistantExecutionRunDetail | null {
  const row = database
    .select({
      id: schema.assistantExecutionRuns.id,
      traceJson: schema.assistantExecutionRuns.traceJson,
    })
    .from(schema.assistantExecutionRuns)
    .where(eq(schema.assistantExecutionRuns.id, id))
    .get();
  return row ? assistantExecutionRunDetailDto(row) : null;
}

export function summarizeAssistantExecutions(
  database: StoreExecutor,
  input: AssistantExecutionQueryInput,
): AssistantExecutionSummary {
  const where = assistantExecutionWhere(input);
  return {
    totals: aggregateAssistantExecutionTotals(database, where),
    byAgent: aggregateAssistantExecutionGroups(database, where, {
      key: sql<string>`${schema.assistantExecutionRuns.agentId}`,
      label: agentGroupLabel(),
    }),
    byProviderModel: aggregateAssistantExecutionGroups(database, where, {
      key: sql<string>`${schema.assistantExecutionRuns.providerId} || ':' || ${schema.assistantExecutionRuns.modelName}`,
      label: sql<string>`${schema.assistantExecutionRuns.providerName} || ' / ' || ${schema.assistantExecutionRuns.modelName}`,
    }),
    byTaskType: aggregateAssistantExecutionGroups(database, where, {
      key: sql<string>`${schema.assistantExecutionRuns.taskType}`,
      label: sql<string>`${schema.assistantExecutionRuns.taskType}`,
    }),
    byMode: aggregateAssistantExecutionGroups(database, where, {
      key: sql<string>`${schema.assistantExecutionRuns.effectiveMode}`,
      label: sql<string>`${schema.assistantExecutionRuns.effectiveMode}`,
    }),
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

export function assistantExecutionRunListItemDto(
  row: AssistantExecutionListRow,
): AssistantExecutionRunListItem {
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
  };
}

export function assistantExecutionRunDetailDto(
  row: AssistantExecutionTraceRow,
): AssistantExecutionRunDetail {
  return {
    id: row.id,
    safeSteps: safeTraceSteps(row.traceJson),
  };
}

export function assistantExecutionRunDto(row: AssistantExecutionRow): AssistantExecutionRun {
  return {
    ...assistantExecutionRunListItemDto(row),
    ...assistantExecutionRunDetailDto(row),
  };
}

export function summarizeAssistantExecutionRows(
  rows: AssistantExecutionRow[],
): AssistantExecutionTotals {
  const accumulator = emptyTotalsAccumulator();
  for (const row of rows) {
    addRowToTotals(accumulator, row);
  }
  return finalizeTotals(accumulator);
}

function aggregateAssistantExecutionTotals(database: StoreExecutor, where: SQL | undefined) {
  const row = database
    .select(assistantExecutionAggregateSelection())
    .from(schema.assistantExecutionRuns)
    .where(where)
    .get();
  return totalsFromAggregate(row);
}

function aggregateAssistantExecutionGroups(
  database: StoreExecutor,
  where: SQL | undefined,
  group: { key: SQL<string>; label: SQL<string> },
): AssistantExecutionSummaryGroup[] {
  const rows = database
    .select({
      key: group.key,
      label: latestGroupLabel(group.label),
      ...assistantExecutionAggregateSelection(),
    })
    .from(schema.assistantExecutionRuns)
    .where(where)
    .groupBy(group.key)
    .all();
  return rows
    .map((row) => Object.assign(totalsFromAggregate(row), { key: row.key, label: row.label }))
    .toSorted((left, right) => right.estimatedCostMicros - left.estimatedCostMicros);
}

function assistantExecutionAggregateSelection() {
  return {
    runCount: count(),
    successCount: statusCount('success'),
    fallbackCount: statusCount('fallback'),
    errorCount: statusCount('error'),
    inputTokens: sumColumn(schema.assistantExecutionRuns.inputTokens),
    outputTokens: sumColumn(schema.assistantExecutionRuns.outputTokens),
    reasoningTokens: sumColumn(schema.assistantExecutionRuns.reasoningTokens),
    cachedInputTokens: sumColumn(schema.assistantExecutionRuns.cachedInputTokens),
    cacheWriteTokens: sumColumn(schema.assistantExecutionRuns.cacheWriteTokens),
    totalTokens: sql<number>`coalesce(sum(coalesce(${schema.assistantExecutionRuns.totalTokens}, coalesce(${schema.assistantExecutionRuns.inputTokens}, 0) + coalesce(${schema.assistantExecutionRuns.outputTokens}, 0) + coalesce(${schema.assistantExecutionRuns.reasoningTokens}, 0) + coalesce(${schema.assistantExecutionRuns.cacheWriteTokens}, 0))), 0)`,
    estimatedCostMicros: sumColumn(schema.assistantExecutionRuns.estimatedCostMicros),
    missingCostCount: sql<number>`coalesce(sum(case when ${schema.assistantExecutionRuns.estimatedCostMicros} is null then 1 else 0 end), 0)`,
    averageDurationMs: sql<number | null>`round(avg(${schema.assistantExecutionRuns.durationMs}))`,
  };
}

function assistantExecutionListSelection() {
  return {
    id: schema.assistantExecutionRuns.id,
    createdAt: schema.assistantExecutionRuns.createdAt,
    agentId: schema.assistantExecutionRuns.agentId,
    agentUsername: schema.assistantExecutionRuns.agentUsername,
    agentNickname: schema.assistantExecutionRuns.agentNickname,
    taskType: schema.assistantExecutionRuns.taskType,
    requestedMode: schema.assistantExecutionRuns.requestedMode,
    effectiveMode: schema.assistantExecutionRuns.effectiveMode,
    providerId: schema.assistantExecutionRuns.providerId,
    providerName: schema.assistantExecutionRuns.providerName,
    modelName: schema.assistantExecutionRuns.modelName,
    status: schema.assistantExecutionRuns.status,
    fallbackReason: schema.assistantExecutionRuns.fallbackReason,
    inputTokens: schema.assistantExecutionRuns.inputTokens,
    outputTokens: schema.assistantExecutionRuns.outputTokens,
    reasoningTokens: schema.assistantExecutionRuns.reasoningTokens,
    cachedInputTokens: schema.assistantExecutionRuns.cachedInputTokens,
    cacheWriteTokens: schema.assistantExecutionRuns.cacheWriteTokens,
    totalTokens: schema.assistantExecutionRuns.totalTokens,
    estimatedCostMicros: schema.assistantExecutionRuns.estimatedCostMicros,
    currency: schema.assistantExecutionRuns.currency,
    durationMs: schema.assistantExecutionRuns.durationMs,
    stepCount: schema.assistantExecutionRuns.stepCount,
  };
}

function statusCount(status: AssistantExecutionStatus) {
  return sql<number>`coalesce(sum(case when ${schema.assistantExecutionRuns.status} = ${status} then 1 else 0 end), 0)`;
}

function sumColumn(column: AnySQLiteColumn) {
  return sql<number>`coalesce(sum(coalesce(${column}, 0)), 0)`;
}

function totalsFromAggregate(
  row: AssistantExecutionAggregateRow | undefined,
): AssistantExecutionTotals {
  const totals: AssistantExecutionTotals = {
    runCount: row?.runCount || 0,
    successCount: row?.successCount || 0,
    fallbackCount: row?.fallbackCount || 0,
    errorCount: row?.errorCount || 0,
    usage: {
      inputTokens: row?.inputTokens || 0,
      outputTokens: row?.outputTokens || 0,
      reasoningTokens: row?.reasoningTokens || 0,
      cachedInputTokens: row?.cachedInputTokens || 0,
      cacheWriteTokens: row?.cacheWriteTokens || 0,
      totalTokens: row?.totalTokens || 0,
    },
    estimatedCostMicros: row?.estimatedCostMicros || 0,
    missingCostCount: row?.missingCostCount || 0,
  };
  if (row?.averageDurationMs !== null && row?.averageDurationMs !== undefined) {
    totals.averageDurationMs = row.averageDurationMs;
  }
  return totals;
}

function agentGroupLabel() {
  return sql<string>`case when ${schema.assistantExecutionRuns.agentNickname} is not null and ${schema.assistantExecutionRuns.agentNickname} <> '' then ${schema.assistantExecutionRuns.agentNickname} when ${schema.assistantExecutionRuns.agentUsername} is not null and ${schema.assistantExecutionRuns.agentUsername} <> '' then '@' || ${schema.assistantExecutionRuns.agentUsername} else ${schema.assistantExecutionRuns.agentId} end`;
}

function latestGroupLabel(label: SQL<string>) {
  const value = sql<string>`${schema.assistantExecutionRuns.createdAt} || char(31) || ${label}`;
  return sql<string>`substr(max(${value}), instr(max(${value}), char(31)) + 1)`;
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

function emptyTotalsAccumulator(): AssistantExecutionTotalsAccumulator {
  return {
    totals: emptyTotals(),
    durationCount: 0,
    durationSum: 0,
  };
}

function addRowToTotals(
  accumulator: AssistantExecutionTotalsAccumulator,
  row: AssistantExecutionRow,
) {
  const { totals } = accumulator;
  totals.runCount += 1;
  const status = normalizeStatus(row.status);
  if (status === 'success') totals.successCount += 1;
  if (status === 'fallback') totals.fallbackCount += 1;
  if (status === 'error') totals.errorCount += 1;
  addUsage(totals.usage, rowUsage(row));
  if (row.estimatedCostMicros === null) totals.missingCostCount += 1;
  else totals.estimatedCostMicros += row.estimatedCostMicros;
  if (row.durationMs !== null) {
    accumulator.durationCount += 1;
    accumulator.durationSum += row.durationMs;
  }
}

function finalizeTotals(
  accumulator: AssistantExecutionTotalsAccumulator,
): AssistantExecutionTotals {
  const { totals } = accumulator;
  if (accumulator.durationCount > 0) {
    totals.averageDurationMs = Math.round(accumulator.durationSum / accumulator.durationCount);
  }
  return totals;
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

function rowUsage(row: AssistantExecutionUsageRow): AssistantExecutionUsage {
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
