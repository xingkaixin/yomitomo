import { describe, expect, it } from 'vitest';
import { desktopIpcErrorCodes } from './ipc-errors';
import { desktopIpcStreamResponseChannel } from './ipc-stream-channel';

describe('desktopIpcStreamResponseChannel', () => {
  it.each(['', 'request:other-channel', 'request/path', 'r'.repeat(129)])(
    'rejects unsafe request id %s',
    (requestId) => {
      expect(() => desktopIpcStreamResponseChannel('agent:comment:stream', requestId)).toThrowError(
        expect.objectContaining({
          code: desktopIpcErrorCodes.invalidArgs,
        }),
      );
    },
  );
});
