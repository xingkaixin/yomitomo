import { describe, expect, it } from 'vitest';
import type { AgentMessagePayload, Comment } from '@yomitomo/shared';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamEvent,
  DesktopIpcStreamRequest,
  DesktopIpcStreamResponseChannel,
} from '../ipc-contract';
import { desktopIpcErrorCodes } from '../ipc-errors';
import { createDesktopIpcStreamClient, type DesktopIpcStreamTransport } from './ipc-stream-client';

describe('desktop IPC stream client', () => {
  it('uses a request-scoped channel and cleans up after completion', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const client = createDesktopIpcStreamClient(transport, () => 'request_1');
    const events: unknown[] = [];
    const result = client.request(
      'agent:comment:stream',
      agentMessagePayload,
      (event) => events.push(event),
      (event) => event.comment,
    );

    expect(transport.sent).toEqual([
      {
        channel: 'agent:comment:stream',
        request: { requestId: 'request_1', payload: agentMessagePayload },
      },
    ]);
    expect(transport.listenerCount('agent:comment:stream:request_1')).toBe(1);

    transport.emit('agent:comment:stream:request_1', { type: 'start', comment: pendingComment });
    transport.emit('agent:comment:stream:request_1', { type: 'delta', delta: 'done' });
    transport.emit('agent:comment:stream:request_1', { type: 'done', comment: finalComment });

    await expect(result).resolves.toEqual(finalComment);
    expect(events).toEqual([
      { type: 'start', comment: pendingComment },
      { type: 'delta', delta: 'done' },
    ]);
    expect(transport.listenerCount('agent:comment:stream:request_1')).toBe(0);
  });

  it('turns an error envelope into a desktop IPC error and cleans up', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const client = createDesktopIpcStreamClient(transport, () => 'request_error');
    const result = client.request(
      'agent:comment:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.comment,
    );

    transport.emit('agent:comment:stream:request_error', {
      type: 'error',
      message: desktopIpcErrorCodes.agentNotFound,
      error: {
        code: desktopIpcErrorCodes.agentNotFound,
        message: desktopIpcErrorCodes.agentNotFound,
      },
    });

    await expect(result).rejects.toMatchObject({
      code: desktopIpcErrorCodes.agentNotFound,
      message: desktopIpcErrorCodes.agentNotFound,
    });
    expect(transport.listenerCount('agent:comment:stream:request_error')).toBe(0);
  });

  it('removes only the listeners attached to the completed response channel', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const requestIds = ['request_1', 'request_2'];
    const client = createDesktopIpcStreamClient(transport, () => requestIds.shift() || 'missing');
    const first = client.request(
      'agent:comment:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.comment,
    );
    const second = client.request(
      'agent:comment:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.comment,
    );

    transport.emit('agent:comment:stream:request_1', { type: 'done', comment: finalComment });

    await expect(first).resolves.toEqual(finalComment);
    expect(transport.listenerCount('agent:comment:stream:request_1')).toBe(0);
    expect(transport.listenerCount('agent:comment:stream:request_2')).toBe(1);

    transport.emit('agent:comment:stream:request_2', { type: 'done', comment: finalComment });
    await expect(second).resolves.toEqual(finalComment);
    expect(transport.listenerCount('agent:comment:stream:request_2')).toBe(0);
  });
});

class MemoryDesktopIpcStreamTransport implements DesktopIpcStreamTransport {
  readonly sent: Array<{
    channel: DesktopIpcStreamChannel;
    request: { requestId: string; payload: unknown };
  }> = [];

  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  subscribe<Channel extends DesktopIpcStreamChannel>(
    channel: DesktopIpcStreamResponseChannel<Channel>,
    callback: (event: DesktopIpcStreamEvent<Channel>) => void,
  ) {
    const listener = (event: unknown) => callback(event as DesktopIpcStreamEvent<Channel>);
    const listeners = this.listeners.get(channel) || new Set();
    listeners.add(listener);
    this.listeners.set(channel, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(channel);
    };
  }

  send<Channel extends DesktopIpcStreamChannel>(
    channel: Channel,
    request: DesktopIpcStreamRequest<Channel>,
  ) {
    this.sent.push({
      channel,
      request: { requestId: request.requestId, payload: request.payload },
    });
  }

  emit<Channel extends DesktopIpcStreamChannel>(
    channel: DesktopIpcStreamResponseChannel<Channel>,
    event: DesktopIpcStreamEvent<Channel>,
  ) {
    for (const listener of this.listeners.get(channel) || []) listener(event);
  }

  listenerCount(channel: string) {
    return this.listeners.get(channel)?.size || 0;
  }
}

const agentMessagePayload = {} as AgentMessagePayload;

const pendingComment: Comment = {
  id: 'comment_1',
  author: 'ai',
  content: '',
  createdAt: '2026-07-15T00:00:00.000Z',
  pending: true,
};

const finalComment: Comment = {
  ...pendingComment,
  content: 'done',
  pending: false,
};
