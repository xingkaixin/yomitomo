import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import type { AppUpdateState } from '../../app-update-types';
import type { DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import { registerStoreDataIpc } from './ipc-store-data';

const ipcState = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
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

beforeEach(() => {
  ipcState.handlers.clear();
});

describe('store data update IPC', () => {
  it('loads the full store for the reading library even when shell store loading is available', async () => {
    const fullStore = desktopStore({
      articles: [
        {
          id: 'article_1',
          url: 'https://example.com',
          canonicalUrl: 'https://example.com',
          sourceType: 'web',
          title: 'Article',
          contentHash: 'hash',
          annotations: [],
          annotationCount: 0,
          commentCount: 0,
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T00:00:00.000Z',
        },
      ],
    });
    const shellStore = desktopStore({ articles: [] });
    const readStoreWithProfile = vi.fn(async () => ({ store: fullStore, profile: [] }));
    const readShellStoreWithProfile = vi.fn(async () => ({ store: shellStore, profile: [] }));
    const context = storeContext({
      readShellStoreWithProfile,
      readStoreWithProfile,
    });

    registerStoreDataIpc(context);

    const envelope = await invokeRegisteredHandler('store:get');

    expect(envelope).toEqual({
      ok: true,
      value: { ok: true, store: fullStore },
    });
    expect(readStoreWithProfile).toHaveBeenCalledTimes(1);
    expect(readShellStoreWithProfile).not.toHaveBeenCalled();
  });

  it('forwards update channels to the app updater module', async () => {
    const updaterModule = {
      checkForAppUpdates: vi.fn(async () => updateState('available')),
      downloadAppUpdate: vi.fn(async () => updateState('downloading')),
      getAppUpdateState: vi.fn(() => updateState('idle')),
      installAppUpdate: vi.fn(() => updateState('downloaded')),
      simulateUpdateAvailable: vi.fn(() => updateState('available')),
    };

    registerStoreDataIpc(storeContext({ readStoreWithProfile: vi.fn(), updaterModule }));

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
type StoreDataPersistenceModule = Awaited<ReturnType<StoreDataIpcContext['getPersistenceModule']>>;

function storeContext(input: {
  readShellStoreWithProfile?: ReturnType<typeof vi.fn>;
  readStoreWithProfile: StoreDataPersistenceModule['storeSnapshotPersistence']['readStoreWithProfile'];
  updaterModule?: Awaited<ReturnType<StoreDataIpcContext['getAppUpdaterModule']>>;
}): StoreDataIpcContext {
  return {
    elapsedMs: () => 1,
    getAppUpdaterModule: async () =>
      input.updaterModule || {
        checkForAppUpdates: vi.fn(),
        downloadAppUpdate: vi.fn(),
        getAppUpdateState: vi.fn(),
        installAppUpdate: vi.fn(),
        simulateUpdateAvailable: vi.fn(),
      },
    getMainWindow: () => null,
    getPersistenceModule: async () => ({
      assistantExecutionPersistence: {
        queryAssistantExecutionRunDetail: vi.fn(),
        queryAssistantExecutionRuns: vi.fn(),
        queryAssistantExecutionSummary: vi.fn(),
      },
      settingsPersistence: {
        saveSettings: vi.fn(),
        saveSettingsShell: vi.fn(async (settings: Record<string, unknown>) => ({
          ...desktopStore({ articles: [] }),
          settings,
        })),
      },
      storeSnapshotPersistence: input,
    }),
    logError: vi.fn(),
    recordStartupTiming: vi.fn(),
    scheduleLogPrune: vi.fn(),
    sendFullStoreUpdated: vi.fn(),
    setSensitiveRendererEventsLocked: vi.fn(),
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
