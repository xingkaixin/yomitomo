import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamDoneEvent,
  DesktopIpcStreamEvent,
  DesktopIpcStreamPayload,
  DesktopIpcStreamProgressEvent,
  DesktopIpcStreamRequest,
  DesktopIpcStreamResponseChannel,
  DesktopIpcStreamResult,
} from '../ipc-contract';
import { desktopIpcErrorFromSerialized } from '../ipc-errors';
import { desktopIpcStreamResponseChannel } from '../ipc-stream-channel';

export interface DesktopIpcStreamTransport {
  subscribe<Channel extends DesktopIpcStreamChannel>(
    channel: DesktopIpcStreamResponseChannel<Channel>,
    callback: (event: DesktopIpcStreamEvent<Channel>) => void,
  ): () => void;
  send<Channel extends DesktopIpcStreamChannel>(
    channel: Channel,
    request: DesktopIpcStreamRequest<Channel>,
  ): void;
}

export function createDesktopIpcStreamClient(
  transport: DesktopIpcStreamTransport,
  requestIdFactory: () => string = makeRequestId,
) {
  return {
    request<Channel extends DesktopIpcStreamChannel>(
      channel: Channel,
      payload: DesktopIpcStreamPayload<Channel>,
      onEvent: (event: DesktopIpcStreamProgressEvent<Channel>) => void,
      resultFromDone: (
        event: DesktopIpcStreamDoneEvent<Channel>,
      ) => DesktopIpcStreamResult<Channel>,
    ): Promise<DesktopIpcStreamResult<Channel>> {
      const requestId = requestIdFactory();
      const responseChannel = desktopIpcStreamResponseChannel(channel, requestId);
      return new Promise((resolve, reject) => {
        const unsubscribe = transport.subscribe(responseChannel, (event) => {
          if (event.type === 'error') {
            unsubscribe();
            reject(
              event.error ? desktopIpcErrorFromSerialized(event.error) : new Error(event.message),
            );
            return;
          }
          if (event.type === 'done') {
            unsubscribe();
            resolve(resultFromDone(event as DesktopIpcStreamDoneEvent<Channel>));
            return;
          }
          onEvent(event as DesktopIpcStreamProgressEvent<Channel>);
        });
        try {
          transport.send(channel, { requestId, payload });
        } catch (error) {
          unsubscribe();
          reject(error);
        }
      });
    },
  };
}

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
