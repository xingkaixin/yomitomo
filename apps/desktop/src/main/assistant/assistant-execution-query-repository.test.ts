import { describe, expect, it } from 'vitest';
import {
  assistantExecutionRunDto,
  summarizeAssistantExecutions,
  summarizeAssistantExecutionRows,
} from './assistant-execution-query-repository';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';

type AssistantExecutionRow = typeof schema.assistantExecutionRuns.$inferSelect;
type AggregateRow = {
  runCount: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  estimatedCostMicros: number;
  missingCostCount: number;
  averageDurationMs: number | null;
};

describe('assistant execution query repository', () => {
  it('maps runs with safe trace steps only', () => {
    const run = assistantExecutionRunDto(
      runRow('run_1', {
        traceJson: {
          steps: [
            {
              stepIndex: 0,
              eventType: 'tool_call',
              toolName: 'search_memory',
              sanitizedToolInput: { query: 'hidden from dto' },
              evidenceSummaries: [{ summary: 'hidden from dto' }],
              resultCount: 2,
              latencyMs: 120,
            },
          ],
        },
      }),
    );

    expect(run).toMatchObject({
      agentNickname: '周现',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      safeSteps: [
        {
          stepIndex: 0,
          eventType: 'tool_call',
          toolName: 'search_memory',
          resultCount: 2,
          latencyMs: 120,
        },
      ],
    });
    expect(JSON.stringify(run)).not.toContain('hidden from dto');
  });

  it('summarizes usage and missing costs', () => {
    const summary = summarizeAssistantExecutionRows([
      runRow('run_1', {
        status: 'success',
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        estimatedCostMicros: 250,
        durationMs: 1000,
      }),
      runRow('run_2', {
        status: 'fallback',
        inputTokens: 50,
        outputTokens: 10,
        totalTokens: 60,
        estimatedCostMicros: null,
        durationMs: 3000,
      }),
    ]);

    expect(summary).toMatchObject({
      runCount: 2,
      successCount: 1,
      fallbackCount: 1,
      estimatedCostMicros: 250,
      missingCostCount: 1,
      averageDurationMs: 2000,
      usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
    });
  });

  it('summarizes groups without changing totals or sort order', () => {
    const summary = summarizeAssistantExecutions(fakeSummaryDatabase(), {
      from: '2026-05-28T00:00:00.000Z',
      to: '2026-05-29T00:00:00.000Z',
    });

    expect(summary.totals).toMatchObject({
      runCount: 3,
      successCount: 1,
      fallbackCount: 1,
      errorCount: 1,
      estimatedCostMicros: 850,
      missingCostCount: 1,
      averageDurationMs: 2000,
    });
    expect(summary.totals.usage).toMatchObject({
      inputTokens: 230,
      outputTokens: 47,
      reasoningTokens: 3,
      cacheWriteTokens: 5,
      totalTokens: 305,
    });
    expect(summary.byAgent.map((group) => group.key)).toEqual(['agent_2', 'agent_1']);
    expect(summary.byAgent[1]).toMatchObject({
      key: 'agent_1',
      label: '周现新版',
      runCount: 2,
      successCount: 1,
      errorCount: 1,
      estimatedCostMicros: 250,
      missingCostCount: 1,
      averageDurationMs: 1000,
    });
    expect(summary.byProviderModel[0]).toMatchObject({
      key: 'provider_2:claude-sonnet',
      label: 'Anthropic / claude-sonnet',
      estimatedCostMicros: 600,
    });
    expect(summary.byProviderModel[1]).toMatchObject({
      key: 'provider_1:gpt-4.1',
      label: 'OpenAI Renamed / gpt-4.1',
      runCount: 2,
    });
  });
});

function fakeSummaryDatabase(): StoreExecutor {
  const groupRows = [
    [
      aggregateGroupRow('agent_1', '周现新版', {
        runCount: 2,
        successCount: 1,
        errorCount: 1,
        inputTokens: 130,
        outputTokens: 27,
        reasoningTokens: 3,
        cacheWriteTokens: 5,
        totalTokens: 165,
        estimatedCostMicros: 250,
        missingCostCount: 1,
        averageDurationMs: 1000,
      }),
      aggregateGroupRow('agent_2', '@li', {
        runCount: 1,
        fallbackCount: 1,
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 140,
        estimatedCostMicros: 600,
        averageDurationMs: 3000,
      }),
    ],
    [
      aggregateGroupRow('provider_1:gpt-4.1', 'OpenAI Renamed / gpt-4.1', {
        runCount: 2,
        successCount: 1,
        errorCount: 1,
        estimatedCostMicros: 250,
        missingCostCount: 1,
      }),
      aggregateGroupRow('provider_2:claude-sonnet', 'Anthropic / claude-sonnet', {
        runCount: 1,
        fallbackCount: 1,
        estimatedCostMicros: 600,
      }),
    ],
    [
      aggregateGroupRow('selection_first', 'selection_first', {
        runCount: 2,
        successCount: 1,
        errorCount: 1,
        estimatedCostMicros: 250,
        missingCostCount: 1,
      }),
      aggregateGroupRow('manual', 'manual', {
        runCount: 1,
        fallbackCount: 1,
        estimatedCostMicros: 600,
      }),
    ],
    [
      aggregateGroupRow('deep_verification', 'deep_verification', {
        runCount: 2,
        successCount: 1,
        errorCount: 1,
        estimatedCostMicros: 250,
        missingCostCount: 1,
      }),
      aggregateGroupRow('fast', 'fast', {
        runCount: 1,
        fallbackCount: 1,
        estimatedCostMicros: 600,
      }),
    ],
  ];
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          get: () =>
            aggregateRow({
              runCount: 3,
              successCount: 1,
              fallbackCount: 1,
              errorCount: 1,
              inputTokens: 230,
              outputTokens: 47,
              reasoningTokens: 3,
              cacheWriteTokens: 5,
              totalTokens: 305,
              estimatedCostMicros: 850,
              missingCostCount: 1,
              averageDurationMs: 2000,
            }),
          groupBy: () => ({
            all: () => groupRows.shift() || [],
          }),
        }),
      }),
    }),
  } as unknown as StoreExecutor;
}

function aggregateGroupRow(key: string, label: string, overrides: Partial<AggregateRow> = {}) {
  return { key, label, ...aggregateRow(overrides) };
}

function aggregateRow(overrides: Partial<AggregateRow> = {}): AggregateRow {
  return {
    runCount: 0,
    successCount: 0,
    fallbackCount: 0,
    errorCount: 0,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: 0,
    estimatedCostMicros: 0,
    missingCostCount: 0,
    averageDurationMs: null,
    ...overrides,
  };
}

function runRow(id: string, overrides: Partial<AssistantExecutionRow> = {}): AssistantExecutionRow {
  return {
    id,
    createdAt: '2026-05-28T01:00:00.000Z',
    agentId: 'agent_1',
    agentUsername: 'zhou',
    agentNickname: '周现',
    taskType: 'selection_first',
    requestedMode: 'deep_verification',
    effectiveMode: 'deep_verification',
    providerId: 'provider_1',
    providerName: 'OpenAI',
    modelName: 'gpt-4.1',
    status: 'success',
    fallbackReason: null,
    inputTokens: 100,
    outputTokens: 20,
    reasoningTokens: null,
    cachedInputTokens: null,
    cacheWriteTokens: null,
    totalTokens: 120,
    estimatedCostMicros: 250,
    currency: 'USD',
    durationMs: 1200,
    stepCount: 0,
    traceJson: null,
    ...overrides,
  };
}
