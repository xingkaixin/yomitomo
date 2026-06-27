import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppUpdateState } from '../../app-update-types';
import type { DesktopIpcInvokeEnvelope } from '../../ipc-errors';
import type { DesktopMainIpcContext } from './ipc';
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
      articles: [{ id: 'article_1', annotations: [], annotationCount: 0, commentCount: 0 }],
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

    registerStoreDataIpc({
      getAppUpdaterModule: async () => updaterModule,
    } as unknown as DesktopMainIpcContext);

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

function storeContext(input: {
  readShellStoreWithProfile?: ReturnType<typeof vi.fn>;
  readStoreWithProfile: ReturnType<typeof vi.fn>;
}) {
  return {
    elapsedMs: () => 1,
    getPersistenceModule: async () => ({
      settingsPersistence: {
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
    setSensitiveRendererEventsLocked: vi.fn(),
    storeLoadErrorInfo: vi.fn(),
  } as unknown as DesktopMainIpcContext;
}

function desktopStore(overrides: Partial<Record<'articles' | 'settings', unknown>> = {}) {
  return {
    agents: [],
    articles: [],
    collectionMembers: [],
    collections: [],
    pins: [],
    providers: [],
    settings: {},
    user: {},
    ...overrides,
  };
}
