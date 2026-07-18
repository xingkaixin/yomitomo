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
import { onDesktopIpcStreamRequest, sendDesktopIpcStreamEvent } from './ipc-events';

export type AgentStreamSender<Channel extends DesktopIpcStreamChannel> = {
  channel: DesktopIpcStreamResponseChannel<Channel>;
  send: (message: DesktopIpcStreamEvent<Channel>) => void;
};

export type AgentStreamGuard<Channel extends DesktopIpcStreamChannel> = (
  input: DesktopIpcStreamRequest<Channel>,
  event: IpcMainEvent,
) => Promise<void>;

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
  onDesktopIpcStreamRequest(requestChannel, async (event, input) => {
    const sender = createAgentStreamSender(
      event,
      desktopIpcStreamResponseChannel(requestChannel, input.requestId),
    );
    try {
      await guard?.(input, event);
      await handler(input, sender, event);
    } catch (error) {
      sender.send(agentStreamError(error, fallbackMessage));
    }
  });
}

function createAgentStreamSender<Channel extends DesktopIpcStreamChannel>(
  event: IpcMainEvent,
  channel: DesktopIpcStreamResponseChannel<Channel>,
): AgentStreamSender<Channel> {
  return {
    channel,
    send: (message) => sendDesktopIpcStreamEvent(event.sender, channel, message),
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
