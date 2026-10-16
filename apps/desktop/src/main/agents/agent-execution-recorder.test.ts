import { describe, expect, it, vi } from 'vitest';
import type { Agent, LlmProvider } from '@yomitomo/shared';
import { createAssistantExecutionRecorder } from './agent-execution-recorder';

describe('assistant execution recorder', () => {
  it('logs synchronous throws and asynchronous rejections without throwing', async () => {
    const executionAsyncError = new Error('execution async');
    const executionSyncError = new Error('execution sync');
    const recordAssistantExecutionRun = vi
      .fn()
      .mockRejectedValueOnce(executionAsyncError)
      .mockImplementationOnce(() => {
        throw executionSyncError;
      });
    const logger = { logError: vi.fn() };
    const recorder = createAssistantExecutionRecorder({ recordAssistantExecutionRun, logger });
    const run = {
      agent: agent(),
      provider: provider(),
      taskType: 'annotation' as const,
      requestedMode: 'fast_response' as const,
      effectiveMode: 'fast_response' as const,
      status: 'success' as const,
    };

    expect(() => recorder.recordFastExecution(run)).not.toThrow();
    expect(() => recorder.recordFastExecution(run)).not.toThrow();

    await vi.waitFor(() => {
      expect(logger.logError).toHaveBeenCalledWith(
        'assistant.execution_run_write_failed',
        executionAsyncError,
      );
      expect(logger.logError).toHaveBeenCalledWith(
        'assistant.execution_run_write_failed',
        executionSyncError,
      );
    });
  });
});

function agent(): Agent {
  return {
    id: 'agent_1',
    kind: 'annotation',
    enabled: true,
    providerId: 'provider_1',
    nickname: 'Agent',
    username: 'agent',
    avatar: '',
    annotationColor: '#54cda0',
    annotationDensity: 'medium',
    temperature: 0.3,
    soul: 'soul',
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}

function provider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://api.example.com',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };
}
