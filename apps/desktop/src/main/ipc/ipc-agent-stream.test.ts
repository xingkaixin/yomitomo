import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMessagePayload, Comment } from '@yomitomo/shared';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

import { runAgentStreamIpc } from './ipc-agent-stream';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('runAgentStreamIpc', () => {
  it('sends handler events to the request-scoped response channel', async () => {
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', async (input, sender) => {
      sender.send({
        type: 'done',
        comment: { ...finalComment, agentUsername: input.payload.agentUsername },
      });
    });
    const sender = { send: vi.fn() };

    await ipcHandler('agent:comment:stream')({ sender }, request('req_1', agentMessagePayload));

    expect(sender.send).toHaveBeenCalledWith('agent:comment:stream:req_1', {
      type: 'done',
      comment: { ...finalComment, agentUsername: 'agent' },
    });
  });

  it('serializes stream errors with the fallback message for generic failures', async () => {
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', async () => {
      throw new Error('low level error');
    });
    const sender = { send: vi.fn() };

    await ipcHandler('agent:comment:stream')({ sender }, request('req_2', agentMessagePayload));

    expect(sender.send).toHaveBeenCalledWith(
      'agent:comment:stream:req_2',
      expect.objectContaining({
        type: 'error',
        message: 'STREAM_FAILED',
        error: expect.objectContaining({ code: desktopIpcErrorCodes.handlerFailed }),
      }),
    );
  });

  it('keeps known desktop IPC error messages', async () => {
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', async () => {
      throw new DesktopIpcError(
        desktopIpcErrorCodes.agentNotFound,
        desktopIpcErrorCodes.agentNotFound,
      );
    });
    const sender = { send: vi.fn() };

    await ipcHandler('agent:comment:stream')({ sender }, request('req_3', agentMessagePayload));

    expect(sender.send).toHaveBeenCalledWith(
      'agent:comment:stream:req_3',
      expect.objectContaining({
        type: 'error',
        message: desktopIpcErrorCodes.agentNotFound,
        error: expect.objectContaining({ code: desktopIpcErrorCodes.agentNotFound }),
      }),
    );
  });

  it('runs the guard before the stream handler', async () => {
    const handler = vi.fn();
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', handler, async () => {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockRequired);
    });
    const sender = { send: vi.fn() };

    await ipcHandler('agent:comment:stream')({ sender }, request('req_4', agentMessagePayload));

    expect(handler).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(
      'agent:comment:stream:req_4',
      expect.objectContaining({
        type: 'error',
        message: desktopIpcErrorCodes.appLockRequired,
        error: expect.objectContaining({ code: desktopIpcErrorCodes.appLockRequired }),
      }),
    );
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

const agentMessagePayload = {
  agentUsername: 'agent',
} as AgentMessagePayload;

const finalComment: Comment = {
  id: 'comment_1',
  author: 'ai',
  content: 'done',
  createdAt: '2026-07-15T00:00:00.000Z',
};
