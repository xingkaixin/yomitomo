import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { registerArticleIpc } from './ipc-article';
import { registerAppLockIpc } from './ipc-app-lock';
import { registerProviderIpc } from './ipc-provider';
import { registerStoreDataIpc } from './ipc-store-data';
import { registerWeReadIpc } from './ipc-weread';
import { configureDesktopIpcAppLockGuardContext, type DesktopMainIpcContext } from './ipc';

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  hasAppLockPin: vi.fn(),
  verifyAppLockPin: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcState.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../app-lock/app-lock-secrets', () => ({
  deleteAppLockPin: vi.fn(),
  hasAppLockPin: ipcState.hasAppLockPin,
  saveAppLockPin: vi.fn(),
  verifyAppLockPin: ipcState.verifyAppLockPin,
}));

vi.mock('../agents/agent-runtime-trace-log', () => ({
  clearAgentRuntimeTraces: vi.fn(),
  getAgentRuntimeTracePath: vi.fn(() => '/tmp/yomitomo-agent-trace.jsonl'),
  readAgentRuntimeTraces: vi.fn(),
}));

vi.mock('../app/logger', () => ({
  clearLogFile: vi.fn(),
  getLogPath: vi.fn(() => '/tmp/yomitomo-agent.log'),
  pruneLogFile: vi.fn(),
  readLogFile: vi.fn(() => 'log'),
}));

beforeEach(() => {
  ipcState.handlers.clear();
  ipcState.hasAppLockPin.mockResolvedValue(true);
  ipcState.verifyAppLockPin.mockResolvedValue(false);
  configureDesktopIpcAppLockGuardContext(null);
});

afterEach(() => {
  configureDesktopIpcAppLockGuardContext(null);
});

describe('app lock IPC guard', () => {
  it('rejects sensitive IPC while app lock is locked', async () => {
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);

    registerArticleIpc(ipcContext);
    registerProviderIpc(ipcContext);
    registerStoreDataIpc(ipcContext);
    registerWeReadIpc(ipcContext);

    await expectAppLockRequired('store:get');
    await expectAppLockRequired('provider:read-api-key', 'openai');
    await expectAppLockRequired('weread:read-api-key');
    await expectAppLockRequired('log:read');
    await expectAppLockRequired('data:paths');
    await expectAppLockRequired('article:get', 'article_1');

    expect(storeModule.readStoredProviderApiKey).not.toHaveBeenCalled();
    expect(storeModule.readStoredWeReadApiKey).not.toHaveBeenCalled();
    expect(storeModule.readArticle).not.toHaveBeenCalled();
  });

  it('does not let setLocked unlock the app from renderer-controlled input', async () => {
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);
    registerAppLockIpc(ipcContext);

    await expectAppLockRequired('appLock:setLocked', { locked: false });

    expect(storeModule.saveSettings).not.toHaveBeenCalled();
  });

  it('unlocks in main after validating the pin in the same handler', async () => {
    ipcState.verifyAppLockPin.mockResolvedValue(true);
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);
    registerAppLockIpc(ipcContext);

    const envelope = await invokeRegisteredHandler('appLock:unlock', { pin: '1234' });

    expect(ipcState.verifyAppLockPin).toHaveBeenCalledWith('1234');
    expect(storeModule.saveSettings).toHaveBeenCalledWith({ appLockLocked: false });
    expect(ipcContext.sendFullStoreUpdated).toHaveBeenCalledWith(
      expect.objectContaining({ settings: expect.objectContaining({ appLockLocked: false }) }),
    );
    expect(envelope).toMatchObject({
      ok: true,
      value: { settings: { appLockEnabled: true, appLockLocked: false } },
    });
  });

  it('keeps the app locked when unlock receives a wrong pin', async () => {
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);
    registerAppLockIpc(ipcContext);

    const envelope = await invokeRegisteredHandler('appLock:unlock', { pin: '0000' });

    expect(envelope).toMatchObject({
      ok: false,
      error: { code: 'APP_LOCK_PIN_INVALID' },
    });
    expect(storeModule.saveSettings).not.toHaveBeenCalled();
    expect(ipcContext.sendFullStoreUpdated).not.toHaveBeenCalled();
  });

  it('allows lock status reads while locked without returning the store', async () => {
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);
    registerAppLockIpc(ipcContext);

    const envelope = await invokeRegisteredHandler('appLock:getStatus');

    expect(envelope).toEqual({
      ok: true,
      value: {
        configured: true,
        enabled: true,
        locked: true,
        shortcut: 'CommandOrControl+L',
      },
    });
  });
});

function context(storeModule: ReturnType<typeof createStoreModule>): DesktopMainIpcContext {
  return {
    elapsedMs: () => 1,
    getAiModule: vi.fn(),
    getAppUpdaterModule: vi.fn(),
    getAppVersion: () => '0.0.0-test',
    getMainWindow: () => null,
    getStoreModule: async () => storeModule,
    logError: vi.fn(),
    logInfo: vi.fn(),
    openExternalUrl: vi.fn(),
    recordPerformanceTiming: vi.fn(),
    recordStartupTiming: vi.fn(),
    scheduleLogPrune: vi.fn(),
    sendArticlePatched: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  } as unknown as DesktopMainIpcContext;
}

async function expectAppLockRequired(channel: string, ...args: unknown[]) {
  const envelope = await invokeRegisteredHandler(channel, ...args);
  expect(envelope).toMatchObject({
    ok: false,
    error: { code: desktopIpcErrorCodes.appLockRequired },
  });
}

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}

function createStoreModule(initialStore: DesktopStore) {
  let store = initialStore;
  return {
    readArticle: vi.fn(async () => ({ id: 'article_1' })),
    readStore: vi.fn(async () => store),
    readStoreWithProfile: vi.fn(async () => ({ store, profile: [] })),
    readStoredProviderApiKey: vi.fn(async () => 'provider-secret'),
    readStoredWeReadApiKey: vi.fn(async () => 'weread-secret'),
    saveSettings: vi.fn(async (settings: Partial<DesktopStore['settings']>) => {
      store = { ...store, settings: { ...store.settings, ...settings } };
      return store;
    }),
  };
}

function lockedStore(): DesktopStore {
  return {
    agents: [],
    articles: [],
    providers: [],
    settings: {
      appLockEnabled: true,
      appLockLocked: true,
      appLockShortcut: 'CommandOrControl+L',
    },
    user: {},
  } as unknown as DesktopStore;
}
