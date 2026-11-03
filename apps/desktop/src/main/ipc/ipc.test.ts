import { beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { handleDesktopIpc, resetDesktopIpcRegistrationsForTest } from './ipc';

const ipcState = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  return {
    handlers,
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler);
    }),
  };
});

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcState.handle,
  },
}));

vi.mock('../store/store-db', () => ({
  withDatabaseLease: (operation: () => Promise<unknown>) => operation(),
}));

beforeEach(() => {
  ipcState.handlers.clear();
  resetDesktopIpcRegistrationsForTest();
});

describe('handleDesktopIpc', () => {
  it('rejects malformed URL imports before invoking the handler', async () => {
    const handler = vi.fn();
    handleDesktopIpc('article:import-url', handler);

    const envelope = await invokeRegisteredHandler('article:import-url', {
      url: 'file:///tmp/article.html',
    });

    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.invalidArgs,
        detail: { channel: 'article:import-url' },
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });
});

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}
