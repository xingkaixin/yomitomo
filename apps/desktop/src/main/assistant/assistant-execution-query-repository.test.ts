import { describe, expect, it } from 'vitest';
import {
  assistantExecutionRunDto,
  summarizeAssistantExecutionRows,
} from './assistant-execution-query-repository';
import * as schema from '../db/schema';

type AssistantExecutionRow = typeof schema.assistantExecutionRuns.$inferSelect;

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
});

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
