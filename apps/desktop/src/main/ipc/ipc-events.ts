import { ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamEvent,
  DesktopIpcStreamResponseChannel,
  DesktopIpcToMainEventArgs,
  DesktopIpcToMainEventChannel,
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
} from '../../ipc-contract';

type DesktopIpcMainEventListener<Channel extends DesktopIpcToMainEventChannel> = (
  event: IpcMainEvent,
  ...args: DesktopIpcToMainEventArgs<Channel>
) => void;

export function onDesktopIpcMainEvent<Channel extends DesktopIpcToMainEventChannel>(
  channel: Channel,
  listener: DesktopIpcMainEventListener<Channel>,
) {
  ipcMain.on(channel, (event, ...args: unknown[]) => {
    listener(event, ...(args as DesktopIpcToMainEventArgs<Channel>));
  });
}

export function sendDesktopIpcRendererEvent<Channel extends DesktopIpcToRendererEventChannel>(
  webContents: Pick<WebContents, 'send'>,
  channel: Channel,
  ...args: DesktopIpcToRendererEventArgs<Channel>
) {
  webContents.send(channel, ...args);
}

export function sendDesktopIpcStreamEvent<Channel extends DesktopIpcStreamChannel>(
  webContents: Pick<WebContents, 'send'>,
  channel: DesktopIpcStreamResponseChannel<Channel>,
  event: DesktopIpcStreamEvent<Channel>,
) {
  webContents.send(channel, event);
}
