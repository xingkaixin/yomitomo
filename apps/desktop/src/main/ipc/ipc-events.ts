import { ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamEvent,
  DesktopIpcStreamRequest,
  DesktopIpcStreamResponseChannel,
  DesktopIpcToMainEventArgs,
  DesktopIpcToMainEventChannel,
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
} from '../../ipc-contract';
import {
  validateDesktopIpcMainEventArgs,
  validateDesktopIpcStreamRequest,
} from '../../ipc-event-schemas';
import type { DesktopIpcError } from '../../ipc-errors';
import { logError } from '../app/logger';

type DesktopIpcMainEventListener<Channel extends DesktopIpcToMainEventChannel> = (
  event: IpcMainEvent,
  ...args: DesktopIpcToMainEventArgs<Channel>
) => void;

export function onDesktopIpcMainEvent<Channel extends DesktopIpcToMainEventChannel>(
  channel: Channel,
  listener: DesktopIpcMainEventListener<Channel>,
) {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    const result = validateDesktopIpcMainEventArgs(channel, args);
    if (!result.success) {
      reportInvalidInput('event', channel, result.error);
      return;
    }
    listener(event, ...result.data);
  });
}

export function sendDesktopIpcRendererEvent<Channel extends DesktopIpcToRendererEventChannel>(
  webContents: Pick<WebContents, 'send'>,
  channel: Channel,
  ...args: DesktopIpcToRendererEventArgs<Channel>
) {
  webContents.send(channel, ...args);
}

export function onDesktopIpcStreamRequest<Channel extends DesktopIpcStreamChannel>(
  channel: Channel,
  listener: (
    event: IpcMainEvent,
    request: DesktopIpcStreamRequest<Channel>,
  ) => void | Promise<void>,
  onInvalidRequest?: (event: IpcMainEvent, requestId: string, error: DesktopIpcError) => void,
) {
  ipcMain.on(channel, (event, request: unknown) => {
    const result = validateDesktopIpcStreamRequest(channel, request);
    if (!result.success) {
      reportInvalidInput('stream', channel, result.error);
      if (result.requestId && onInvalidRequest) {
        try {
          onInvalidRequest(event, result.requestId, result.error);
        } catch (error) {
          logError('ipc.invalid_response_failed', error, { channel });
        }
      }
      return;
    }
    return listener(event, result.data);
  });
}

export function sendDesktopIpcStreamEvent<Channel extends DesktopIpcStreamChannel>(
  webContents: Pick<WebContents, 'send'>,
  channel: DesktopIpcStreamResponseChannel<Channel>,
  event: DesktopIpcStreamEvent<Channel>,
) {
  webContents.send(channel, event);
}

function reportInvalidInput(
  kind: 'event' | 'stream',
  channel: DesktopIpcToMainEventChannel,
  error: DesktopIpcError,
) {
  logError('ipc.input_rejected', error, { channel, kind });
}
