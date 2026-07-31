import { describe, expect, it, vi } from 'vitest';
import type { AssistantRuntimeResult } from '@yomitomo/ai';
import type { Agent, Comment, LlmProvider } from '@yomitomo/shared';
import {
  createAssistantExecutionRecorder,
  type RuntimeExecutionRecord,
} from './agent-execution-recorder';

describe('assistant execution recorder', () => {
  it('records a final runtime to the trace and execution sinks', async () => {
    const appendRuntimeTrace = vi.fn();
    const recordAssistantExecutionRun = vi.fn();
    const logger = loggerFixture();
    const recorder = createAssistantExecutionRecorder({
      appendRuntimeTrace,
      recordAssistantExecutionRun,
      logger,
    });

    recorder.recordRuntimeExecution(runtimeRecord());

    await vi.waitFor(() => {
      expect(appendRuntimeTrace).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'thread_reply',
          agentId: 'agent_1',
          articleId: 'article_1',
          runtimeStatus: 'final',
        }),
      );
      expect(recordAssistantExecutionRun).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'thread_reply',
          effectiveMode: 'deep_verification',
          status: 'success',
        }),
      );
    });
  });

  it('records a fallback runtime separately from its fast attempt', async () => {
    const appendRuntimeTrace = vi.fn();
    const recordAssistantExecutionRun = vi.fn();
    const recorder = createAssistantExecutionRecorder({
      appendRuntimeTrace,
      recordAssistantExecutionRun,
      logger: loggerFixture(),
    });
    const fallback = {
      ...runtimeRecord(),
      result: {
        status: 'fallback' as const,
        failureReason: 'tool_loop_failed',
        runtime: runtime(),
      },
    };

    recorder.recordRuntimeExecution(fallback);
    recorder.recordFastExecution({
      agent: agent(),
      provider: provider(),
      taskType: 'thread_reply',
      requestedMode: 'deep_verification',
      effectiveMode: 'fast_response',
      status: 'success',
      fallbackReason: 'tool_loop_failed',
    });

    await vi.waitFor(() => {
      expect(recordAssistantExecutionRun).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          effectiveMode: 'deep_verification',
          status: 'fallback',
          fallbackReason: 'tool_loop_failed',
        }),
      );
      expect(recordAssistantExecutionRun).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          effectiveMode: 'fast_response',
          status: 'success',
          fallbackReason: 'tool_loop_failed',
        }),
      );
    });
    expect(appendRuntimeTrace).toHaveBeenCalledOnce();
  });

  it('writes fast execution rows without a runtime trace', async () => {
    const appendRuntimeTrace = vi.fn();
    const recordAssistantExecutionRun = vi.fn();
    const recorder = createAssistantExecutionRecorder({
      appendRuntimeTrace,
      recordAssistantExecutionRun,
      logger: loggerFixture(),
    });

    recorder.recordFastExecution({
      agent: agent(),
      provider: provider(),
      taskType: 'annotation',
      requestedMode: 'fast_response',
      effectiveMode: 'fast_response',
      status: 'success',
      fallbackReason: 'annotation_runtime_not_applicable',
    });

    await vi.waitFor(() => expect(recordAssistantExecutionRun).toHaveBeenCalledOnce());
    expect(appendRuntimeTrace).not.toHaveBeenCalled();
  });

  it('logs synchronous throws and asynchronous rejections without throwing', async () => {
    const traceSyncError = new Error('trace sync');
    const traceAsyncError = new Error('trace async');
    const executionAsyncError = new Error('execution async');
    const executionSyncError = new Error('execution sync');
    const appendRuntimeTrace = vi
      .fn()
      .mockImplementationOnce(() => {
        throw traceSyncError;
      })
      .mockRejectedValueOnce(traceAsyncError);
    const recordAssistantExecutionRun = vi
      .fn()
      .mockRejectedValueOnce(executionAsyncError)
      .mockImplementationOnce(() => {
        throw executionSyncError;
      });
    const logger = loggerFixture();
    const recorder = createAssistantExecutionRecorder({
      appendRuntimeTrace,
      recordAssistantExecutionRun,
      logger,
    });

    expect(() => recorder.recordRuntimeExecution(runtimeRecord())).not.toThrow();
    expect(() => recorder.recordRuntimeExecution(runtimeRecord())).not.toThrow();

    await vi.waitFor(() => {
      expect(logger.logError).toHaveBeenCalledWith(
        'assistant_runtime.trace_write_failed',
        traceSyncError,
      );
      expect(logger.logError).toHaveBeenCalledWith(
        'assistant_runtime.trace_write_failed',
        traceAsyncError,
      );
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

function runtimeRecord(): RuntimeExecutionRecord {
  return {
    result: {
      status: 'comment',
      comment: comment(),
      runtime: runtime(),
    },
    provider: provider(),
    agent: agent(),
    requestedMode: 'deep_verification',
    taskType: 'thread_reply',
    durationMs: 42,
  };
}

function runtime(): Extract<AssistantRuntimeResult, { status: 'final' }> {
  return {
    status: 'final',
    action: {
      type: 'reply_to_thread',
      annotationId: 'annotation_1',
      content: 'reply',
      evidenceIds: [],
      confidence: 0.9,
      reason: 'enough evidence',
    },
    evidence: [],
    repairUsed: false,
    trace: {
      taskType: 'thread_reply',
      agentId: 'agent_1',
      articleId: 'article_1',
      startedAt: '2026-07-31T00:00:00.000Z',
      completedAt: '2026-07-31T00:00:01.000Z',
      finalActionType: 'reply_to_thread',
      steps: [],
    },
  };
}

function loggerFixture() {
  return { logError: vi.fn(), logInfo: vi.fn() };
}

function comment(): Comment {
  return {
    id: 'comment_1',
    author: {
      kind: 'agent',
      agentId: 'agent_1',
      username: 'agent',
      nickname: 'Agent',
      avatar: '',
      annotationColor: '#54cda0',
    },
    content: 'reply',
    createdAt: '2026-07-31T00:00:00.000Z',
  };
}

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
