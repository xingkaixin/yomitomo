import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { emptyDesktopStore } from '../../app-store';
import type { DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import type { StartupStoreInitializationResult } from '../app/startup-store';
import { registerStoreDataIpc } from './ipc-store-data';

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  restoreDatabaseWithDialog: vi.fn(),
  restoreFullDataWithDialog: vi.fn(),
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
  restoreFullDataWithDialog: ipcState.restoreFullDataWithDialog,
}));

beforeEach(() => {
  ipcState.handlers.clear();
  ipcState.restoreDatabaseWithDialog.mockReset();
  ipcState.restoreFullDataWithDialog.mockReset();
});

describe('store data update IPC', () => {
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
});

async function invokeRegisteredHandler(channel: string, ...args: unknown[]) {
  const handler = ipcState.handlers.get(channel);
  if (!handler) throw new Error(`${channel} handler was not registered`);
  return (await handler({}, ...args)) as DesktopIpcInvokeEnvelope<unknown>;
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
    onDatabaseRestored: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  };
}

function desktopStore(
  overrides: Partial<Pick<DesktopStore, 'articles' | 'settings'>> = {},
): DesktopStore {
  return {
    ...emptyDesktopStore,
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
