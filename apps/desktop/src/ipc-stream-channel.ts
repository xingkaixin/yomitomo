import type { DesktopIpcStreamChannel, DesktopIpcStreamResponseChannel } from './ipc-contract';

export function desktopIpcStreamResponseChannel<Channel extends DesktopIpcStreamChannel>(
  channel: Channel,
  requestId: string,
): DesktopIpcStreamResponseChannel<Channel> {
  return `${channel}:${requestId}`;
}
