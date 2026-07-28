import type {
  DesktopIpcStreamCancelRequest,
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
  cancel(request: DesktopIpcStreamCancelRequest): void;
}

export class DesktopIpcStreamCancelledError extends Error {
  readonly code = 'IPC_STREAM_CANCELLED';

  constructor() {
    super('Stream request was cancelled');
  }
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
      signal?: AbortSignal,
    ): Promise<DesktopIpcStreamResult<Channel>> {
      const requestId = requestIdFactory();
      const responseChannel = desktopIpcStreamResponseChannel(channel, requestId);
      return new Promise((resolve, reject) => {
        // Unsubscribing before telling main to cancel keeps late events from a racing
        // completion out of an abandoned session.
        const abort = () => {
          unsubscribe();
          transport.cancel({ channel, requestId });
          reject(new DesktopIpcStreamCancelledError());
        };
        if (signal?.aborted) {
          transport.cancel({ channel, requestId });
          reject(new DesktopIpcStreamCancelledError());
          return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        const unsubscribe = transport.subscribe(responseChannel, (event) => {
          if (event.type === 'error') {
            settle();
            reject(
              event.error ? desktopIpcErrorFromSerialized(event.error) : new Error(event.message),
            );
            return;
          }
          if (event.type === 'done') {
            settle();
            resolve(resultFromDone(event as DesktopIpcStreamDoneEvent<Channel>));
            return;
          }
          onEvent(event as DesktopIpcStreamProgressEvent<Channel>);
        });
        function settle() {
          unsubscribe();
          signal?.removeEventListener('abort', abort);
        }

        try {
          transport.send(channel, { requestId, payload });
        } catch (error) {
          settle();
          reject(error);
        }
      });
    },
  };
}

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
