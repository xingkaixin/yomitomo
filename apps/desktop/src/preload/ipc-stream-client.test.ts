import { describe, expect, it } from 'vitest';
import type {
  AgentDistillationReviewPayload,
  AnnotationDistillationReviewMessage,
} from '@yomitomo/shared';
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
      'agent:distillation-review:stream',
      agentMessagePayload,
      (event) => events.push(event),
      (event) => event.message,
    );

    expect(transport.sent).toEqual([
      {
        channel: 'agent:distillation-review:stream',
        request: { requestId: 'request_1', payload: agentMessagePayload },
      },
    ]);
    expect(transport.listenerCount('agent:distillation-review:stream:request_1')).toBe(1);

    transport.emit('agent:distillation-review:stream:request_1', {
      type: 'start',
      message: pendingMessage,
    });
    transport.emit('agent:distillation-review:stream:request_1', { type: 'delta', delta: 'done' });
    transport.emit('agent:distillation-review:stream:request_1', {
      type: 'done',
      message: finalMessage,
    });

    await expect(result).resolves.toEqual(finalMessage);
    expect(events).toEqual([
      { type: 'start', message: pendingMessage },
      { type: 'delta', delta: 'done' },
    ]);
    expect(transport.listenerCount('agent:distillation-review:stream:request_1')).toBe(0);
  });

  it('turns an error envelope into a desktop IPC error and cleans up', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const client = createDesktopIpcStreamClient(transport, () => 'request_error');
    const result = client.request(
      'agent:distillation-review:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.message,
    );

    transport.emit('agent:distillation-review:stream:request_error', {
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
    expect(transport.listenerCount('agent:distillation-review:stream:request_error')).toBe(0);
  });

  it('removes only the listeners attached to the completed response channel', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const requestIds = ['request_1', 'request_2'];
    const client = createDesktopIpcStreamClient(transport, () => requestIds.shift() || 'missing');
    const first = client.request(
      'agent:distillation-review:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.message,
    );
    const second = client.request(
      'agent:distillation-review:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.message,
    );

    transport.emit('agent:distillation-review:stream:request_1', {
      type: 'done',
      message: finalMessage,
    });

    await expect(first).resolves.toEqual(finalMessage);
    expect(transport.listenerCount('agent:distillation-review:stream:request_1')).toBe(0);
    expect(transport.listenerCount('agent:distillation-review:stream:request_2')).toBe(1);

    transport.emit('agent:distillation-review:stream:request_2', {
      type: 'done',
      message: finalMessage,
    });
    await expect(second).resolves.toEqual(finalMessage);
    expect(transport.listenerCount('agent:distillation-review:stream:request_2')).toBe(0);
  });

  it('cleans up duplicate listeners attached to the same response channel', async () => {
    const transport = new MemoryDesktopIpcStreamTransport();
    const client = createDesktopIpcStreamClient(transport, () => 'shared_request');
    const first = client.request(
      'agent:distillation-review:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.message,
    );
    const second = client.request(
      'agent:distillation-review:stream',
      agentMessagePayload,
      () => undefined,
      (event) => event.message,
    );

    expect(transport.listenerCount('agent:distillation-review:stream:shared_request')).toBe(2);
    transport.emit('agent:distillation-review:stream:shared_request', {
      type: 'done',
      message: finalMessage,
    });

    await expect(Promise.all([first, second])).resolves.toEqual([finalMessage, finalMessage]);
    expect(transport.listenerCount('agent:distillation-review:stream:shared_request')).toBe(0);
  });
});

class MemoryDesktopIpcStreamTransport implements DesktopIpcStreamTransport {
  readonly sent: Array<{
    channel: DesktopIpcStreamChannel;
    request: { requestId: string; payload: unknown };
  }> = [];

  readonly cancelled: Array<{ channel: DesktopIpcStreamChannel; requestId: string }> = [];

  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  cancel(request: { channel: DesktopIpcStreamChannel; requestId: string }) {
    this.cancelled.push(request);
  }

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

const agentMessagePayload = {} as AgentDistillationReviewPayload;

const pendingMessage: AnnotationDistillationReviewMessage = {
  id: 'review_message_1',
  author: { kind: 'agent', agentId: 'agent_1', username: 'agent' },
  content: '',
  createdAt: '2026-07-15T00:00:00.000Z',
  status: 'pending',
};

const finalMessage: AnnotationDistillationReviewMessage = {
  ...pendingMessage,
  content: 'done',
  status: 'done',
};
