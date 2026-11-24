import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import {
  configureDesktopIpcAppLockGuardContext,
  handleDesktopIpc,
  resetDesktopIpcRegistrationsForTest,
} from './ipc';

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
  configureDesktopIpcAppLockGuardContext(null);
});

afterEach(() => {
  configureDesktopIpcAppLockGuardContext(null);
});

describe('handleDesktopIpc', () => {
  it('waits for startup app-lock initialization before allowing protected IPC calls', async () => {
    let locked = false;
    let releaseStartup!: () => void;
    const startupReady = new Promise<void>((resolve) => {
      releaseStartup = () => {
        locked = true;
        resolve();
      };
    });
    configureDesktopIpcAppLockGuardContext({
      getPersistenceModules: async () => ({
        storeSettings: {
          readAppLockSettings: () => ({ appLockEnabled: true, appLockLocked: locked }),
        },
      }),
      waitForStartupReady: () => startupReady,
    });
    const handler = vi.fn(() => null);
    handleDesktopIpc('article:get', handler);

    const pendingEnvelope = invokeRegisteredHandler('article:get', 'article_1');
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();

    releaseStartup();
    const envelope = await pendingEnvelope;

    expect(envelope).toMatchObject({
      ok: false,
      error: { code: desktopIpcErrorCodes.appLockRequired },
    });
    expect(handler).not.toHaveBeenCalled();
  });

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
