import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { desktopIpcErrorCodes, type DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { resetAppLockPinAttempts } from '../app-lock/app-lock-attempt-policy';
import { registerAppLockIpc } from './ipc-app-lock';
import { registerStoreDataIpc } from './ipc-store-data';
import { configureDesktopIpcAppLockGuardContext, handleDesktopIpc } from './ipc';

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
  vi.clearAllMocks();
  ipcState.handlers.clear();
  ipcState.hasAppLockPin.mockResolvedValue(true);
  ipcState.verifyAppLockPin.mockResolvedValue(false);
  resetAppLockPinAttempts();
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

    registerStoreDataIpc(ipcContext);
    const protectedHandler = vi.fn();
    handleDesktopIpc('provider:read-api-key', protectedHandler);
    handleDesktopIpc('weread:read-api-key', protectedHandler);
    handleDesktopIpc('log:read', protectedHandler);
    handleDesktopIpc('data:paths', protectedHandler);
    handleDesktopIpc('article:get', protectedHandler);
    handleDesktopIpc('library-collection:create', protectedHandler);

    await expectAppLockRequired('store:get');
    await expectAppLockRequired('provider:read-api-key', 'openai');
    await expectAppLockRequired('weread:read-api-key');
    await expectAppLockRequired('log:read');
    await expectAppLockRequired('data:paths');
    await expectAppLockRequired('article:get', 'article_1');
    await expectAppLockRequired('library-collection:create', { name: '合集' });

    expect(ipcContext.setSensitiveRendererEventsLocked).toHaveBeenCalledWith(true);
    expect(protectedHandler).not.toHaveBeenCalled();
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
      expect.anything(),
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

  it('shares cooldown state across PIN verification entry points', async () => {
    const storeModule = createStoreModule(lockedStore());
    const ipcContext = context(storeModule);
    registerAppLockIpc(ipcContext);

    let lastVerification: DesktopIpcInvokeEnvelope<unknown> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      lastVerification = await invokeRegisteredHandler('appLock:verifyPin', { pin: '0000' });
    }
    const envelope = await invokeRegisteredHandler('appLock:unlock', { pin: '0000' });

    expect(ipcState.verifyAppLockPin).toHaveBeenCalledTimes(3);
    expect(lastVerification).toEqual({
      ok: true,
      value: { ok: false, retryAfterMs: 1_000, status: 'invalid' },
    });
    expect(envelope).toMatchObject({
      ok: false,
      error: {
        code: desktopIpcErrorCodes.appLockRateLimited,
        detail: { retryAfterMs: expect.any(Number) },
      },
    });
  });

  it('returns only the locked renderer store when locking from an unlocked app', async () => {
    const storeModule = createStoreModule(unlockedStoreWithArticle());
    const ipcContext = context(storeModule);
    configureDesktopIpcAppLockGuardContext(ipcContext);
    registerAppLockIpc(ipcContext);

    const envelope = await invokeRegisteredHandler('appLock:setLocked', { locked: true });

    expect(storeModule.saveSettings).toHaveBeenCalledWith({ appLockLocked: true });
    expect(ipcContext.sendFullStoreUpdated).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        articles: [],
        settings: expect.objectContaining({ appLockEnabled: true, appLockLocked: true }),
      }),
    );
    expect(envelope).toMatchObject({
      ok: true,
      value: {
        articles: [],
        settings: { appLockEnabled: true, appLockLocked: true },
      },
    });
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

function context(storeModule: ReturnType<typeof createStoreModule>) {
  return {
    elapsedMs: () => 1,
    getAppUpdaterModule: async () => ({
      checkForAppUpdates: vi.fn(),
      downloadAppUpdate: vi.fn(),
      getAppUpdateState: vi.fn(),
      installAppUpdate: vi.fn(),
      simulateUpdateAvailable: vi.fn(),
    }),
    getMainWindow: () => null,
    getPersistenceModules: async () => ({
      storeAssistantExecutions: {
        queryAssistantExecutionRunDetail: vi.fn(),
        queryAssistantExecutionRuns: vi.fn(),
        queryAssistantExecutionSummary: vi.fn(),
      },
      storeSettings: {
        saveSettings: storeModule.saveSettings,
        saveSettingsShell: storeModule.saveSettings,
      },
      storeSnapshot: {
        readStore: storeModule.readStore,
        readShellStoreWithProfile: storeModule.readShellStoreWithProfile,
        readStoreWithProfile: storeModule.readStoreWithProfile,
      },
    }),
    logError: vi.fn(),
    recordStartupTiming: vi.fn(),
    scheduleLogPrune: vi.fn(),
    setSensitiveRendererEventsLocked: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  };
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
    readShellStoreWithProfile: vi.fn(async () => ({ store, profile: [] })),
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

function unlockedStoreWithArticle(): DesktopStore {
  return {
    ...lockedStore(),
    articles: [
      {
        id: 'article_secret',
        title: '敏感文章',
        url: '',
        canonicalUrl: '',
        excerpt: '敏感摘要',
        byline: '',
        siteName: '',
        contentHash: 'hash',
        sourceType: 'web',
        annotations: [],
        annotationCount: 0,
        commentCount: 0,
        aiCommentCount: 0,
        distillationCount: 0,
        createdAt: '2026-06-27T00:00:00.000Z',
        updatedAt: '2026-06-27T00:00:00.000Z',
      },
    ],
    settings: {
      appLockEnabled: true,
      appLockLocked: false,
      appLockShortcut: 'CommandOrControl+L',
      onboardingCompletedAt: '2026-06-27T00:00:00.000Z',
    },
  } as unknown as DesktopStore;
}
