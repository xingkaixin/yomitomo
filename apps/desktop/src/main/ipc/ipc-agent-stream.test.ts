import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentAnnotatePayload,
  AgentMessagePayload,
  Annotation,
  Comment,
  PublicAgent,
} from '@yomitomo/shared';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const logError = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('../app/logger', () => ({ logError }));

import { runAgentStreamIpc } from './ipc-agent-stream';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('runAgentStreamIpc', () => {
  it('sends handler events to the request-scoped response channel', async () => {
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', async (input, sender) => {
      sender.send({
        type: 'done',
        comment: {
          ...finalComment,
          author: {
            kind: 'agent',
            agentId: 'agent_1',
            username: input.payload.agentUsername,
          },
        },
      });
    });
    const sender = streamSender();

    await ipcHandler('agent:comment:stream')({ sender }, request('req_1', agentMessagePayload));

    expect(sender.send).toHaveBeenCalledWith('agent:comment:stream:req_1', {
      type: 'done',
      comment: {
        ...finalComment,
        author: { kind: 'agent', agentId: 'agent_1', username: 'agent' },
      },
    });
  });

  it('serializes stream errors with the fallback message for generic failures', async () => {
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', async () => {
      throw new Error('low level error');
    });
    const sender = streamSender();

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
    const sender = streamSender();

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
    const sender = streamSender();

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

  it.each([
    ['missing request', undefined],
    ['non-string request id', request(42, agentMessagePayload)],
    ['overlong request id', request('r'.repeat(129), agentMessagePayload)],
  ])('drops a %s before guard and handler execution', async (_label, malformedRequest) => {
    const guard = vi.fn();
    const handler = vi.fn();
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', handler, guard);
    const sender = streamSender();

    expect(() => ipcHandler('agent:comment:stream')({ sender }, malformedRequest)).not.toThrow();

    expect(guard).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(sender.send).not.toHaveBeenCalled();
  });

  it.each([
    ['overlong article text', { ...agentMessagePayload, article: article('x'.repeat(20_000_001)) }],
    [
      'oversized agent roster',
      {
        ...agentMessagePayload,
        agentRoster: Array.from({ length: 101 }, () => publicAgent),
      },
    ],
    [
      'invalid nested reader progress',
      { ...agentMessagePayload, readerProgress: { currentChapterId: 1, readChapterIds: [] } },
    ],
    [
      'invalid annotation author identity',
      {
        ...agentMessagePayload,
        annotation: {
          ...annotation,
          author: { kind: 'agent', username: 'agent' },
        },
      },
    ],
  ])('rejects %s before guard and handler execution', async (_label, payload) => {
    const guard = vi.fn();
    const handler = vi.fn();
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', handler, guard);
    const sender = streamSender();

    expect(() =>
      ipcHandler('agent:comment:stream')({ sender }, request('req_invalid', payload)),
    ).not.toThrow();

    expect(guard).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(
      'agent:comment:stream:req_invalid',
      expect.objectContaining({
        type: 'error',
        message: desktopIpcErrorCodes.invalidArgs,
        error: expect.objectContaining({ code: desktopIpcErrorCodes.invalidArgs }),
      }),
    );
  });

  it('rejects an oversized annotation array on annotate streams', () => {
    const guard = vi.fn();
    const handler = vi.fn();
    runAgentStreamIpc('agent:annotate:stream', 'STREAM_FAILED', handler, guard);
    const sender = streamSender();
    const payload: AgentAnnotatePayload = {
      agentUsername: 'agent',
      article: article('article text'),
      annotations: Array.from({ length: 501 }, () => annotation),
    };

    expect(() =>
      ipcHandler('agent:annotate:stream')({ sender }, request('req_annotate', payload)),
    ).not.toThrow();

    expect(guard).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(sender.send).toHaveBeenCalledWith(
      'agent:annotate:stream:req_annotate',
      expect.objectContaining({
        type: 'error',
        error: expect.objectContaining({ code: desktopIpcErrorCodes.invalidArgs }),
      }),
    );
  });

  it('does not surface send failures while rejecting malformed requests', () => {
    const handler = vi.fn();
    runAgentStreamIpc('agent:comment:stream', 'STREAM_FAILED', handler);
    const sender = {
      send: vi.fn(() => {
        throw new Error('sender destroyed');
      }),
    };

    expect(() =>
      ipcHandler('agent:comment:stream')(
        { sender },
        request('req_destroyed', { ...agentMessagePayload, readerProgress: null }),
      ),
    ).not.toThrow();

    expect(handler).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      'ipc.invalid_response_failed',
      expect.any(Error),
      expect.objectContaining({ channel: 'agent:comment:stream' }),
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

const publicAgent: PublicAgent = {
  id: 'agent_1',
  kind: 'annotation',
  enabled: true,
  nickname: 'Agent',
  username: 'agent',
  avatar: '',
  annotationColor: '#fff',
  annotationDensity: 'medium',
  temperature: 0.5,
  personalityName: 'Agent',
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

const finalComment: Comment = {
  id: 'comment_1',
  author: { kind: 'agent', agentId: 'agent_1', username: 'agent' },
  content: 'done',
  createdAt: '2026-07-15T00:00:00.000Z',
};

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
