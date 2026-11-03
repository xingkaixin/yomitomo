import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentMessagePayload, Annotation } from '@yomitomo/shared';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('../app/logger', () => ({ logError: vi.fn() }));

import { runAgentStreamIpc } from './ipc-agent-stream';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('runAgentStreamIpc', () => {
  it('runs the guard before the stream handler', async () => {
    const handler = vi.fn();
    runAgentStreamIpc('agent:distillation-review:stream', 'STREAM_FAILED', handler, async () => {
      throw new DesktopIpcError(desktopIpcErrorCodes.appLockRequired);
    });
    const sender = streamSender();

    await ipcHandler('agent:distillation-review:stream')(
      { sender },
      request('req_4', agentMessagePayload),
    );

    expect(handler).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(
      'agent:distillation-review:stream:req_4',
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

function request<TPayload>(requestId: unknown, payload: TPayload) {
  return { requestId, payload };
}

function article(text: string) {
  return {
    title: 'Article',
    url: 'https://example.com/article',
    text,
  };
}

const annotation: Annotation = {
  id: 'annotation_1',
  anchor: {
    exact: 'article',
    prefix: '',
    suffix: ' text',
    start: 0,
    end: 7,
  },
  author: { kind: 'user', username: 'reader' },
  color: '#fff',
  comments: [],
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const agentMessagePayload = {
  agentUsername: 'agent',
  article: article('article text'),
  annotation,
  userComment: {
    id: 'comment_user',
    author: { kind: 'user', username: 'reader' },
    content: 'question',
    createdAt: '2026-07-15T00:00:00.000Z',
  },
} as AgentMessagePayload;

let streamSenderId = 0;

function streamSender() {
  streamSenderId += 1;
  return {
    id: streamSenderId,
    isDestroyed: () => false,
    off: vi.fn(),
    once: vi.fn(),
    send: vi.fn(),
  };
}
