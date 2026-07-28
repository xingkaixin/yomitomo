import type { IpcMainEvent } from 'electron';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamErrorEvent,
  DesktopIpcStreamEvent,
  DesktopIpcStreamRequest,
  DesktopIpcStreamResponseChannel,
} from '../../ipc-contract';
import { desktopIpcErrorCodes, serializeDesktopIpcError } from '../../ipc-errors';
import { desktopIpcStreamResponseChannel } from '../../ipc-stream-channel';
import {
  onDesktopIpcMainEvent,
  onDesktopIpcStreamRequest,
  sendDesktopIpcStreamEvent,
} from './ipc-events';
import { createAgentStreamTasks } from './agent-stream-tasks';

type AgentStreamTask = ReturnType<ReturnType<typeof createAgentStreamTasks>['start']>;

export type AgentStreamSender<Channel extends DesktopIpcStreamChannel> = {
  channel: DesktopIpcStreamResponseChannel<Channel>;
  send: (message: DesktopIpcStreamEvent<Channel>) => void;
  signal: AbortSignal;
};

export type AgentStreamGuard<Channel extends DesktopIpcStreamChannel> = (
  input: DesktopIpcStreamRequest<Channel>,
  event: IpcMainEvent,
) => Promise<void>;

export const agentStreamTasks = createAgentStreamTasks();

export function registerAgentStreamCancelIpc() {
  onDesktopIpcMainEvent('agent:stream-cancel', (event, request) => {
    agentStreamTasks.cancel(event.sender.id, request.channel, request.requestId);
  });
}

export function runAgentStreamIpc<Channel extends DesktopIpcStreamChannel>(
  requestChannel: Channel,
  fallbackMessage: string,
  handler: (
    input: DesktopIpcStreamRequest<Channel>,
    sender: AgentStreamSender<Channel>,
    event: IpcMainEvent,
  ) => Promise<void>,
  guard?: AgentStreamGuard<Channel>,
) {
  onDesktopIpcStreamRequest(
    requestChannel,
    async (event, input) => {
      const task = agentStreamTasks.start(event.sender, requestChannel, input.requestId);
      const sender = createAgentStreamSender(
        event,
        desktopIpcStreamResponseChannel(requestChannel, input.requestId),
        task,
      );
      try {
        await guard?.(input, event);
        await handler(input, sender, event);
        task.finish();
      } catch (error) {
        // A cancelled task owns its own terminal state; its failure is expected, not reported.
        if (task.fail()) sender.send(agentStreamError(error, fallbackMessage));
      }
    },
    (event, requestId, error) => {
      createAgentStreamSender(
        event,
        desktopIpcStreamResponseChannel(requestChannel, requestId),
      ).send(agentStreamError(error, fallbackMessage));
    },
  );
}

function createAgentStreamSender<Channel extends DesktopIpcStreamChannel>(
  event: IpcMainEvent,
  channel: DesktopIpcStreamResponseChannel<Channel>,
  task?: AgentStreamTask,
): AgentStreamSender<Channel> {
  return {
    channel,
    send: (message) => {
      if (task?.isCancelled()) return;
      if (event.sender.isDestroyed()) return;
      sendDesktopIpcStreamEvent(event.sender, channel, message);
    },
    signal: task?.signal || AbortSignal.abort(),
  };
}

function agentStreamError(error: unknown, fallbackMessage: string): DesktopIpcStreamErrorEvent {
  const serialized = serializeDesktopIpcError(error);
  return {
    type: 'error',
    message:
      serialized.code === desktopIpcErrorCodes.handlerFailed ? fallbackMessage : serialized.message,
    error: serialized,
  };
}
