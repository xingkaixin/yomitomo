import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import type { AppUpdateState } from '../../app-update-types';
import type { DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import type { StartupStoreInitializationResult } from '../app/startup-store';
import { registerStoreDataIpc } from './ipc-store-data';

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  restoreDatabaseWithDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcState.handlers.set(channel, handler);
    }),
  },
}));

vi.mock('../agents/agent-runtime-trace-log', () => ({
  clearAgentRuntimeTraces: vi.fn(),
  getAgentRuntimeTracePath: vi.fn(() => '/tmp/yomitomo-agent-trace.jsonl'),
  readAgentRuntimeTraces: vi.fn(),
}));

vi.mock('../app/logger', () => ({
  clearLogFile: vi.fn(),
  getLogPath: vi.fn(() => '/tmp/yomitomo.log'),
  readLogFile: vi.fn(() => 'log'),
}));

vi.mock('../data-management', () => ({
  restoreDatabaseWithDialog: ipcState.restoreDatabaseWithDialog,
}));

beforeEach(() => {
  ipcState.handlers.clear();
  ipcState.restoreDatabaseWithDialog.mockReset();
});

describe('store data update IPC', () => {
  it('loads the shell store without the full article catalog', async () => {
    const shellStore = desktopStore({ articles: [] });
    const readShellStore = vi.fn(async () => shellStore);
    const context = storeContext({ readShellStore });

    registerStoreDataIpc(context);

    const envelope = await invokeRegisteredHandler('store:get');

    expect(envelope).toEqual({
      ok: true,
      value: { ok: true, store: shellStore },
    });
    expect(readShellStore).toHaveBeenCalledTimes(1);
  });

  it('returns the startup failure without reading an unlocked store', async () => {
    const startupError = new Error('startup lock failed');
    const loadError = { code: 'DATABASE_UNAVAILABLE' as const };
    const readShellStore = vi.fn(async () => desktopStore({ articles: [] }));
    const context = storeContext({
      readShellStore,
      startupStoreInitialization: { ok: false, error: startupError },
    });
    context.storeLoadErrorInfo = vi.fn(async () => loadError);

    registerStoreDataIpc(context);

    const envelope = await invokeRegisteredHandler('store:get');

    expect(envelope).toEqual({
      ok: true,
      value: { ok: false, error: loadError },
    });
    expect(context.storeLoadErrorInfo).toHaveBeenCalledWith(startupError);
    expect(readShellStore).not.toHaveBeenCalled();
  });

  it('forwards update channels to the app updater module', async () => {
    const updaterModule = {
      checkForAppUpdates: vi.fn(async () => updateState('available')),
      downloadAppUpdate: vi.fn(async () => updateState('downloading')),
      getAppUpdateState: vi.fn(() => updateState('idle')),
      installAppUpdate: vi.fn(() => updateState('downloaded')),
      simulateUpdateAvailable: vi.fn(() => updateState('available')),
    };

    registerStoreDataIpc(storeContext({ updaterModule }));

    await expectUpdateForward('updates:get-status', updaterModule.getAppUpdateState, 'idle');
    await expectUpdateForward('updates:check', updaterModule.checkForAppUpdates, 'available');
    await expectUpdateForward('updates:download', updaterModule.downloadAppUpdate, 'downloading');
    await expectUpdateForward('updates:install', updaterModule.installAppUpdate, 'downloaded');
    await expectUpdateForward(
      'updates:simulate-available',
      updaterModule.simulateUpdateAvailable,
      'available',
    );
  });

  it('forwards restored stores with their source event', async () => {
    const store = desktopStore();
    ipcState.restoreDatabaseWithDialog.mockResolvedValue({ canceled: false, store });
    const context = storeContext({});
    registerStoreDataIpc(context);
    const handler = ipcState.handlers.get('data:database-restore');
    const event = { sender: { id: 17 } };

    const result = await handler?.(event);

    expect(result).toEqual({ ok: true, value: { canceled: false, store } });
    expect(context.sendFullStoreUpdated).toHaveBeenCalledWith(event, store);
  });
});

async function expectUpdateForward(
  channel: string,
  updaterFunction: ReturnType<typeof vi.fn>,
  expectedStatus: AppUpdateState['status'],
) {
  const envelope = await invokeRegisteredHandler(channel);

  expect(envelope).toEqual({
    ok: true,
    value: updateState(expectedStatus),
  });
  expect(updaterFunction).toHaveBeenCalledTimes(1);
}

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
}

function updateState(status: AppUpdateState['status']): AppUpdateState {
  return {
    status,
    currentVersion: '1.2.3-test',
  };
}

type StoreDataIpcContext = Parameters<typeof registerStoreDataIpc>[0];
type StoreDataPersistenceModules = Awaited<
  ReturnType<StoreDataIpcContext['getPersistenceModules']>
>;

function storeContext(input: {
  readShellStore?: StoreDataPersistenceModules['storeSnapshot']['readShellStore'];
  startupStoreInitialization?: StartupStoreInitializationResult;
  updaterModule?: Awaited<ReturnType<StoreDataIpcContext['getAppUpdaterModule']>>;
}): StoreDataIpcContext {
  return {
    startupStoreInitialization: input.startupStoreInitialization || { ok: true },
    getAppUpdaterModule: async () =>
      input.updaterModule || {
        checkForAppUpdates: vi.fn(),
        downloadAppUpdate: vi.fn(),
        getAppUpdateState: vi.fn(),
        installAppUpdate: vi.fn(),
        simulateUpdateAvailable: vi.fn(),
      },
    getMainWindow: () => null,
    getPersistenceModules: async () => ({
      storeAssistantExecutions: {
        queryAssistantExecutionRunDetail: vi.fn(),
        queryAssistantExecutionRuns: vi.fn(),
        queryAssistantExecutionSummary: vi.fn(),
      },
      storeSnapshot: {
        readShellStore: input.readShellStore || vi.fn(async () => desktopStore({ articles: [] })),
      },
    }),
    logError: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  };
}

function desktopStore(
  overrides: Partial<Pick<DesktopStore, 'articles' | 'settings'>> = {},
): DesktopStore {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings: {},
    user: {
      id: 'user_1',
      nickname: 'Test User',
      username: 'test-user',
      avatar: '',
      annotationColor: '#f4c95d',
      updatedAt: '2026-07-13T00:00:00.000Z',
    },
    ...overrides,
  };
}
