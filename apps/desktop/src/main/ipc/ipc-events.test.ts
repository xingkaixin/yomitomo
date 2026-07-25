import { beforeEach, describe, expect, it, vi } from 'vitest';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const logError = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    }),
  },
}));

vi.mock('../app/logger', () => ({ logError }));

import { onDesktopIpcMainEvent } from './ipc-events';

beforeEach(() => {
  ipcHandlers.clear();
});

describe('onDesktopIpcMainEvent', () => {
  it('drops malformed event arguments before listener execution', () => {
    const listener = vi.fn();
    onDesktopIpcMainEvent('app:renderer-ready', listener);

    expect(() => ipcHandler('app:renderer-ready')({}, 'unexpected')).not.toThrow();

    expect(listener).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      'ipc.input_rejected',
      expect.any(Error),
      expect.objectContaining({ channel: 'app:renderer-ready', kind: 'event' }),
    );
  });
});

function ipcHandler(channel: string) {
  const handler = ipcHandlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return handler;
}
