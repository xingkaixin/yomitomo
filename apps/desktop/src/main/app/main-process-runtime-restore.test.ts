import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  backupDatabaseFile,
  closeDatabase,
  getDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  replaceDatabaseFile,
} from '../store/store-db';
import { startMainProcessRuntime } from './main-process-runtime';
import { createDesktopTelemetryController } from '../telemetry/desktop-telemetry';
import { readTelemetryState, upsertTelemetryState } from '../telemetry/telemetry-repository';
import { registerStoreDataIpc } from '../ipc/ipc-store-data';
import * as schema from '../db/schema';
import * as weReadRepository from '../weread/weread-repository';
import * as providerSecrets from '../providers/provider-secrets';
import type { ReadingMemoryModelLifecycleState } from '../reading-memory/reading-memory-model-lifecycle';

const paths = vi.hoisted(() => ({ userData: '' }));
const ipcHandlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  dialog: {
    showOpenDialog: async () => ({
      canceled: false,
      filePaths: [join(paths.userData, 'auto-sync-backup.sqlite')],
    }),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      ipcHandlers.set(channel, handler);
    },
  },
  powerMonitor: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return { loadSQLiteDatabase: () => SQLiteDatabase };
});
vi.mock('./logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));

beforeEach(async () => {
  ipcHandlers.clear();
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-background-restore-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
});

it.each(['weread', 'model-pricing'] as const)(
  'waits for an in-flight %s task before replacing its database',
  async (task) => {
    writeMarker('restored');
    const backup = join(paths.userData, 'backup.sqlite');
    await backupDatabaseFile(backup);
    writeMarker('current');
    const started = deferred();
    const release = deferred();
    const finished = deferred();
    const settings = {
      configured: task === 'weread',
      openMethod: 'deeplink' as const,
      syncMode: 'auto' as const,
    };
    const work = async () => {
      started.resolve();
      await release.promise;
      writeMarker('background');
    };
    const runtime = startMainProcessRuntime({
      getPersistenceModules: async () => ({
        storeModelPricing: {
          refreshModelPrices: async () => {
            if (task === 'model-pricing') await work();
            return { refreshed: false, recordCount: 0, reason: 'fresh_cache' as const };
          },
        },
        weReadRepository: {
          readWeReadSettings: async () => settings,
          readStoredWeReadApiKey: async () => 'test-key',
          saveWeReadLibrarySnapshot: async () => ({ settings, books: [] }),
        },
      }),
      getAppUpdaterModule: async () => ({ checkForAppUpdates: vi.fn() }),
      getAppVersion: () => 'test',
      sendWeReadStateUpdated: vi.fn(),
      elapsedMs: () => 0,
      logInfo: (event) => {
        if (event === 'weread.auto_sync.complete' || event === 'model_pricing.refresh') {
          finished.resolve();
        }
      },
      logError: vi.fn(),
      createTelemetryController: () => ({ check() {}, dispose() {} }),
      startEvidenceProjectionWorker: () => ({ requestRun() {}, dispose() {} }),
      readingMemoryModelLifecycle: modelLifecycleStub(),
      syncWeRead: async () => {
        await work();
        return { settings, books: [] };
      },
      timing: {
        weReadStartupDelayMs: task === 'weread' ? 1 : 60_000,
        modelPriceStartupDelayMs: task === 'model-pricing' ? 1 : 60_000,
        appUpdateStartupDelayMs: 60_000,
        weReadIntervalMs: 60_000,
        modelPriceIntervalMs: 60_000,
        appUpdateIntervalMs: 60_000,
      },
    });

    let restoration: Promise<string> | undefined;
    try {
      await started.promise;
      restoration = replaceDatabaseFile(backup);
      expect(readDatabaseLifecycle()).toMatchObject({ state: 'draining', leases: 1 });
      release.resolve();
      await finished.promise;
      await restoration;
      expect(getSqliteExecutor().prepare('SELECT value FROM review_marker').get()).toEqual({
        value: 'restored',
      });
      expect(readDatabaseLifecycle().leases).toBe(0);
    } finally {
      release.resolve();
      await finished.promise;
      await restoration;
      runtime.dispose();
    }
  },
);

it('finishes a telemetry heartbeat before restoring its saved identity', async () => {
  const restored = { installId: 'restored', lastHeartbeatDay: '1900-01-01' };
  upsertTelemetryState(getDatabase(), restored);
  const backup = join(paths.userData, 'backup.sqlite');
  await backupDatabaseFile(backup);
  upsertTelemetryState(getDatabase(), { installId: 'current' });
  const response = deferred<Response>();
  const fetch = vi.spyOn(globalThis, 'fetch').mockReturnValue(response.promise);
  const finished = deferred();
  const controller = createDesktopTelemetryController({
    getAppVersion: () => 'test',
    logInfo: (event) => {
      if (event === 'telemetry.heartbeat_sent') finished.resolve();
    },
  });
  let restoration: Promise<string> | undefined;
  try {
    controller.check('manual');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    restoration = replaceDatabaseFile(backup);
    expect(readDatabaseLifecycle()).toMatchObject({ state: 'draining', leases: 1 });
    response.resolve(new Response(null, { status: 204 }));
    await finished.promise;
    await restoration;
    expect(readTelemetryState(getDatabase())).toEqual(restored);
    expect(readDatabaseLifecycle().leases).toBe(0);
  } finally {
    response.resolve(new Response(null, { status: 204 }));
    await finished.promise;
    await restoration;
    controller.dispose();
  }
});

it('starts automatic sync when the restore IPC replaces manual settings', async () => {
  await import('../data-management');
  vi.spyOn(providerSecrets, 'readWeReadApiKey').mockResolvedValue('test-key');
  getDatabase()
    .insert(schema.wereadAccounts)
    .values({
      id: 'default',
      apiKeyRef: 'test-key-ref',
      openMethod: 'deeplink',
      syncMode: 'auto',
      skillVersion: '1.0.3',
      status: 'connected',
      updatedAt: '2026-08-28T00:00:00.000Z',
    })
    .run();
  await backupDatabaseFile(join(paths.userData, 'auto-sync-backup.sqlite'));
  getDatabase().update(schema.wereadAccounts).set({ syncMode: 'manual' }).run();
  const syncWeRead = vi.fn(() => weReadRepository.readWeReadState());
  const requestEvidenceProjection = vi.fn();
  const reconcileReadingMemoryModel = vi.fn(async () => notInstalledModelState());
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  const runtime = startMainProcessRuntime({
    getPersistenceModules: async () => ({
      weReadRepository,
      storeModelPricing: { refreshModelPrices: vi.fn() },
    }),
    getAppUpdaterModule: async () => ({ checkForAppUpdates: vi.fn() }),
    getAppVersion: () => 'test',
    sendWeReadStateUpdated: vi.fn(),
    elapsedMs: () => 0,
    logInfo: vi.fn(),
    logError: vi.fn(),
    createTelemetryController: () => ({ check() {}, dispose() {} }),
    startEvidenceProjectionWorker: () => ({
      requestRun: requestEvidenceProjection,
      dispose() {},
    }),
    readingMemoryModelLifecycle: modelLifecycleStub(reconcileReadingMemoryModel),
    syncWeRead,
    timing: {
      weReadStartupDelayMs: 10,
      weReadIntervalMs: 100,
      modelPriceStartupDelayMs: 60_000,
      appUpdateStartupDelayMs: 60_000,
    },
  });
  try {
    await vi.advanceTimersByTimeAsync(20);
    expect(syncWeRead).not.toHaveBeenCalled();
    const sendFullStoreUpdated = vi.fn();
    registerStoreDataIpc({
      getMainWindow: () => null,
      logError: vi.fn(),
      storeLoadErrorInfo: vi.fn(),
      sendFullStoreUpdated,
      startupStoreInitialization: { ok: true },
      onDatabaseRestored: runtime.onDatabaseRestored,
      getPersistenceModules: vi.fn(),
      getAppUpdaterModule: vi.fn(),
    });
    const result = await ipcHandlers.get('data:database-restore')?.({ sender: { id: 1 } });
    expect(result).toMatchObject({ ok: true, value: { canceled: false } });
    expect(sendFullStoreUpdated).toHaveBeenCalledOnce();
    expect(requestEvidenceProjection).toHaveBeenCalledWith('database_restored');
    expect(reconcileReadingMemoryModel).toHaveBeenNthCalledWith(1, 'startup');
    expect(reconcileReadingMemoryModel).toHaveBeenNthCalledWith(2, 'database-restored');
    await vi.advanceTimersByTimeAsync(10);
    expect(syncWeRead).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(100);
    expect(syncWeRead).toHaveBeenCalledTimes(2);
  } finally {
    runtime.dispose();
    vi.useRealTimers();
  }
});

function writeMarker(value: string) {
  const database = getSqliteExecutor();
  database.exec('CREATE TABLE IF NOT EXISTS review_marker (value TEXT NOT NULL)');
  database.exec('DELETE FROM review_marker');
  database.prepare('INSERT INTO review_marker (value) VALUES (?)').run(value);
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function modelLifecycleStub(reconcile = vi.fn(async () => notInstalledModelState())) {
  return { reconcile, dispose: vi.fn() };
}

function notInstalledModelState(): ReadingMemoryModelLifecycleState {
  return {
    status: 'not-installed',
    internalId: 'test-model',
    downloadSizeBytes: 0,
    resumeBytes: 0,
  };
}
