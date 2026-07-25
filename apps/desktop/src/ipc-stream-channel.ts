import type { DesktopIpcStreamChannel, DesktopIpcStreamResponseChannel } from './ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes } from './ipc-errors';

export const MAX_DESKTOP_IPC_STREAM_REQUEST_ID_LENGTH = 128;

const desktopIpcStreamRequestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function isDesktopIpcStreamRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_DESKTOP_IPC_STREAM_REQUEST_ID_LENGTH &&
    desktopIpcStreamRequestIdPattern.test(value)
  );
}

export function desktopIpcStreamResponseChannel<Channel extends DesktopIpcStreamChannel>(
  channel: Channel,
  requestId: string,
): DesktopIpcStreamResponseChannel<Channel> {
  if (!isDesktopIpcStreamRequestId(requestId)) {
    throw new DesktopIpcError(desktopIpcErrorCodes.invalidArgs);
  }
  return `${channel}:${requestId}`;
}
