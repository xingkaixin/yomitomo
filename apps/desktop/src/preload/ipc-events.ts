import { ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  DesktopIpcStreamChannel,
  DesktopIpcStreamEvent,
  DesktopIpcStreamResponseChannel,
  DesktopIpcToMainEventArgs,
  DesktopIpcToMainEventChannel,
  DesktopIpcToRendererEventArgs,
  DesktopIpcToRendererEventChannel,
} from '../ipc-contract';
import type { DesktopIpcStreamTransport } from './ipc-stream-client';

type DesktopIpcRendererEventListener<Channel extends DesktopIpcToRendererEventChannel> = (
  ...args: DesktopIpcToRendererEventArgs<Channel>
) => void;

export function onDesktopIpcRendererEvent<Channel extends DesktopIpcToRendererEventChannel>(
  channel: Channel,
  callback: DesktopIpcRendererEventListener<Channel>,
) {
  const listener = (_event: IpcRendererEvent, ...args: unknown[]) => {
    callback(...(args as DesktopIpcToRendererEventArgs<Channel>));
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

export function sendDesktopIpcMainEvent<Channel extends DesktopIpcToMainEventChannel>(
  channel: Channel,
  ...args: DesktopIpcToMainEventArgs<Channel>
) {
  ipcRenderer.send(channel, ...args);
}

export const electronDesktopIpcStreamTransport: DesktopIpcStreamTransport = {
  subscribe<Channel extends DesktopIpcStreamChannel>(
    channel: DesktopIpcStreamResponseChannel<Channel>,
    callback: (event: DesktopIpcStreamEvent<Channel>) => void,
  ) {
    const listener = (_event: IpcRendererEvent, event: unknown) => {
      callback(event as DesktopIpcStreamEvent<Channel>);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
  send(channel, request) {
    ipcRenderer.send(channel, request);
  },
};
