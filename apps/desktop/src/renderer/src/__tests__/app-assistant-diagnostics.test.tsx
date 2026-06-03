// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import { AiUsagePanel, AiTraceSettingsPanel } from '../app-assistant-diagnostics';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const agents: Agent[] = [
  {
    id: 'agent_1',
    kind: 'annotation',
    providerId: 'provider_1',
    nickname: '周现',
    username: 'zhou',
    avatar: '',
    annotationColor: '#f4c95d',
    annotationDensity: 'medium',
    temperature: 0.5,
    soul: '',
    enabled: true,
    createdAt: '',
    updatedAt: '',
  },
];

const providers: LlmProvider[] = [
  {
    id: 'provider_1',
    name: 'OpenAI',
    type: 'openai-chat',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-4.1',
    createdAt: '',
    updatedAt: '',
  },
];

function installDiagnosticsApi() {
  const desktop = {
    listAssistantExecutions: vi.fn().mockResolvedValue([
      {
        id: 'run_1',
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
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 10,
          cacheWriteTokens: 0,
          reasoningTokens: 5,
          totalTokens: 125,
        },
        estimatedCostMicros: 250,
        currency: 'USD',
        durationMs: 1200,
        stepCount: 1,
        safeSteps: [
          {
            stepIndex: 0,
            eventType: 'tool_call',
            toolName: 'search_memory',
            latencyMs: 120,
            resultCount: 2,
          },
        ],
      },
    ]),
    summarizeAssistantExecutions: vi.fn().mockResolvedValue({
      totals: {
        runCount: 1,
        successCount: 1,
        fallbackCount: 0,
        errorCount: 0,
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          cachedInputTokens: 10,
          cacheWriteTokens: 0,
          reasoningTokens: 5,
          totalTokens: 125,
        },
        estimatedCostMicros: 250,
        missingCostCount: 0,
        averageDurationMs: 1200,
      },
      byAgent: [
        {
          key: 'agent_1',
          label: '周现',
          runCount: 1,
          successCount: 1,
          fallbackCount: 0,
          errorCount: 0,
          usage: {
            inputTokens: 100,
            outputTokens: 20,
            cachedInputTokens: 10,
            cacheWriteTokens: 0,
            reasoningTokens: 5,
            totalTokens: 125,
          },
          estimatedCostMicros: 250,
          missingCostCount: 0,
          averageDurationMs: 1200,
        },
      ],
      byProviderModel: [],
      byTaskType: [],
      byMode: [],
    }),
  };

  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });

  return desktop;
}

describe('assistant diagnostics panels', () => {
  it('shows assistant execution runs and expands safe steps', async () => {
    installDiagnosticsApi();

    render(<AiTraceSettingsPanel agents={agents} providers={providers} />);

    expect(await screen.findByText('助手调用链路')).toBeTruthy();
    expect(await screen.findByText('selection_first')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /周现/ }));

    expect(await screen.findByText('search_memory')).toBeTruthy();
    expect(screen.queryByText('traceJson')).toBeNull();
    expect(screen.queryByText('无失败原因')).toBeNull();
    expect(screen.queryByText('无 tool')).toBeNull();
  });

  it('shows ai usage overview and per-agent distribution', async () => {
    const desktop = installDiagnosticsApi();

    render(<AiUsagePanel agents={agents} />);

    expect(await screen.findByText('按助手分布')).toBeTruthy();
    expect(await screen.findByText('周现')).toBeTruthy();
    expect(screen.getAllByText('$0.00025').length).toBeGreaterThan(0);
    expect(desktop.summarizeAssistantExecutions).toHaveBeenCalledOnce();
  });
});
