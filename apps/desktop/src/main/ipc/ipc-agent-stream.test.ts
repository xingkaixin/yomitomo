import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import type { AgentStreamErrorEvent } from './ipc-agent-stream';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

import { createAgentTextStream, runAgentStreamIpc } from './ipc-agent-stream';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('runAgentStreamIpc', () => {
  it('sends handler events to the request-scoped response channel', async () => {
    runAgentStreamIpc<{ value: string }, { type: 'done'; value: string }>(
      'agent:test:stream',
      'STREAM_FAILED',
      async (input, sender) => {
        sender.send({ type: 'done', value: input.payload.value });
      },
    );
    const sender = { send: vi.fn() };

    await ipcHandler('agent:test:stream')({ sender }, request('req_1', { value: 'ok' }));

    expect(sender.send).toHaveBeenCalledWith('agent:test:stream:req_1', {
      type: 'done',
      value: 'ok',
    });
  });

  it('serializes stream errors with the fallback message for generic failures', async () => {
    runAgentStreamIpc<{ value: string }, AgentStreamErrorEvent>(
      'agent:test:error-stream',
      'STREAM_FAILED',
      async () => {
        throw new Error('low level error');
      },
    );
    const sender = { send: vi.fn() };

    await ipcHandler('agent:test:error-stream')({ sender }, request('req_2', { value: 'fail' }));

    expect(sender.send).toHaveBeenCalledWith(
      'agent:test:error-stream:req_2',
      expect.objectContaining({
        type: 'error',
        message: 'STREAM_FAILED',
        error: expect.objectContaining({ code: desktopIpcErrorCodes.handlerFailed }),
      }),
    );
  });

  it('keeps known desktop IPC error messages', async () => {
    runAgentStreamIpc<{ value: string }, AgentStreamErrorEvent>(
      'agent:test:known-error-stream',
      'STREAM_FAILED',
      async () => {
        throw new DesktopIpcError(
          desktopIpcErrorCodes.agentNotFound,
          desktopIpcErrorCodes.agentNotFound,
        );
      },
    );
    const sender = { send: vi.fn() };

    await ipcHandler('agent:test:known-error-stream')(
      { sender },
      request('req_3', { value: 'fail' }),
    );

    expect(sender.send).toHaveBeenCalledWith(
      'agent:test:known-error-stream:req_3',
      expect.objectContaining({
        type: 'error',
        message: desktopIpcErrorCodes.agentNotFound,
        error: expect.objectContaining({ code: desktopIpcErrorCodes.agentNotFound }),
      }),
    );
  });
});

describe('createAgentTextStream', () => {
  it('updates target content and forwards runtime progress events', () => {
    const events: unknown[] = [];
    const target = { content: '' };
    const textStream = createAgentTextStream({ send: (event) => events.push(event) }, target);

    textStream.runtimeEvent({ type: 'text_delta', delta: 'hello' });
    textStream.runtimeEvent({ type: 'tool_call', toolName: 'get_anchor_context', stepIndex: 0 });
    textStream.runtimeEvent({
      type: 'tool_result',
      toolName: 'get_anchor_context',
      stepIndex: 0,
      ok: true,
    });
    textStream.runtimeEvent({ type: 'fallback', reason: 'runtime_not_applicable' });

    expect(target.content).toBe('hello');
    expect(events).toEqual([
      { type: 'delta', delta: 'hello' },
      {
        type: 'progress',
        progress: {
          type: 'step',
          step: { id: 'get_anchor_context', label: 'get_anchor_context', status: 'active' },
        },
      },
      {
        type: 'progress',
        progress: {
          type: 'step',
          step: { id: 'get_anchor_context', label: 'get_anchor_context', status: 'done' },
        },
      },
      {
        type: 'progress',
        progress: {
          type: 'fallback',
          message: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE',
        },
      },
    ]);
    expect(target).toMatchObject({
      assistantProgress: {
        fallbackMessage: 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE',
        steps: [{ id: 'get_anchor_context', label: 'get_anchor_context', status: 'done' }],
      },
    });
  });
});

function ipcHandler(channel: string) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return handler;
}

function request<TPayload>(requestId: string, payload: TPayload) {
  return { requestId, payload };
}
