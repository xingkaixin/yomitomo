import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  backupDatabaseFile,
  closeDatabase,
  getSqliteExecutor,
  readDatabaseLifecycle,
  replaceDatabaseFile,
} from '../store/store-db';
import { startMainProcessRuntime } from './main-process-runtime';

const paths = vi.hoisted(() => ({ userData: '' }));

vi.mock('../../reading-memory-release', () => ({ readingMemoryEnabled: true }));

vi.mock('electron', () => ({
  app: { getPath: () => paths.userData },
  powerMonitor: { on: vi.fn(), off: vi.fn() },
}));
vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return { loadSQLiteDatabase: () => SQLiteDatabase };
});
vi.mock('./logger', () => ({ logInfo: vi.fn(), logError: vi.fn() }));

beforeEach(async () => {
  paths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-background-restore-'));
});

afterEach(async () => {
  vi.restoreAllMocks();
  closeDatabase();
  await rm(paths.userData, { recursive: true, force: true });
});

it.each(['weread', 'model-pricing'] as const)(
  'does not block database replacement or shutdown while %s network work is in flight',
  async (task) => {
    writeMarker('restored');
    const backup = join(paths.userData, 'backup.sqlite');
    await backupDatabaseFile(backup);
    writeMarker('current');
    const started = deferred();
    const release = deferred();
    let receivedSignal: AbortSignal | undefined;
    const settings = {
      configured: task === 'weread',
      openMethod: 'deeplink' as const,
      syncMode: 'auto' as const,
    };
    const networkWork = async (signal?: AbortSignal) => {
      receivedSignal = signal;
      started.resolve();
      await release.promise;
    };
    const runtime = startMainProcessRuntime({
      getPersistenceModules: async () => ({
        storeModelPricing: {
          refreshModelPrices: async (options) => {
            if (task === 'model-pricing') await networkWork(options?.signal);
            return { refreshed: false, recordCount: 0, reason: 'fresh_cache' as const };
          },
        },
        weReadRepository: {
          readWeReadSettings: async () => settings,
          readStoredWeReadApiKey: async () => 'test-key',
          readWeReadApiKeyRef: () => 'test-key-ref',
          saveWeReadLibrarySnapshot: async () => ({ settings, books: [] }),
        },
      }),
      getAppUpdaterModule: async () => ({ checkForAppUpdates: vi.fn() }),
      getAppVersion: () => 'test',
      sendWeReadStateUpdated: vi.fn(),
      elapsedMs: () => 0,
      logInfo: vi.fn(),
      logError: vi.fn(),
      createTelemetryController: () => ({
        check() {},
        recordReadingMemoryUsage() {},
        dispose() {},
      }),
      startEvidenceProjectionWorker: () => ({ requestRun() {}, async dispose() {} }),
      readingMemoryControls: readingMemoryControlsStub(),
      syncWeRead: async (input) => {
        await networkWork(input.signal);
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

    try {
      await started.promise;
      expect(readDatabaseLifecycle().leases).toBe(0);
      await replaceDatabaseFile(backup);
      expect(getSqliteExecutor().prepare('SELECT value FROM review_marker').get()).toEqual({
        value: 'restored',
      });

      await runtime.dispose();
      expect(receivedSignal?.aborted).toBe(true);
    } finally {
      release.resolve();
      await runtime.dispose();
    }
  },
);

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

function readingMemoryControlsStub() {
  return {
    reconcile: vi.fn(async () => undefined),
    notifyEvidenceChanged: vi.fn(),
    suspendForAppUpdate: vi.fn(async () => undefined),
    resumeAfterAppUpdateFailure: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
}
