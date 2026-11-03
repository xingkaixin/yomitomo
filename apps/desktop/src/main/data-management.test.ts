import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  root: '',
  appData: '',
  userData: '',
  documents: '',
  dialog: {
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
  },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
  store: {
    backupDatabaseFile: vi.fn(),
    replaceDatabaseFile: vi.fn(),
    readStore: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return testState.userData;
      if (name === 'documents') return testState.documents;
      return testState.appData;
    },
  },
  dialog: testState.dialog,
  shell: testState.shell,
}));

vi.mock('./store/store-snapshot', () => ({
  readStore: testState.store.readStore,
}));

vi.mock('./store/store-db', () => ({
  backupDatabaseFile: testState.store.backupDatabaseFile,
  getDataDirectoryPath: () => testState.userData,
  getDatabasePath: () => join(testState.userData, 'yomitomo.sqlite'),
  replaceDatabaseFile: testState.store.replaceDatabaseFile,
}));

vi.mock('./native/sqlite', () => ({
  loadSQLiteDatabase: () => SQLiteDatabase,
}));

import { restoreDatabaseWithDialog } from './data-management';
import { DATABASE_READER_LEVEL_KEY } from './db/compatibility';
import { createReadingMemoryTelemetry } from './telemetry/reading-memory-telemetry';

const onDatabaseRestored = vi.fn();

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'yomitomo-data-management-test-'));
  testState.root = root;
  testState.appData = join(root, 'app-data');
  testState.userData = join(root, 'user-data');
  testState.documents = join(root, 'documents');
  await mkdir(testState.appData, { recursive: true });
  await mkdir(testState.userData, { recursive: true });
  await mkdir(testState.documents, { recursive: true });
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(testState.root, { recursive: true, force: true });
  testState.root = '';
});

describe('database restore dialog', () => {
  it('rejects files that are not SQLite databases', async () => {
    const filePath = join(testState.userData, 'not-sqlite.sqlite');
    await writeFile(filePath, 'not a sqlite database');
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null, onDatabaseRestored)).rejects.toThrow(
      'DATA_MANAGEMENT_INVALID_SQLITE_DATABASE',
    );
    expect(onDatabaseRestored).not.toHaveBeenCalled();
  });

  it('rejects SQLite files without Yomitomo migration metadata', async () => {
    const filePath = join(testState.userData, 'plain.sqlite');
    createSqliteFile(filePath);
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null, onDatabaseRestored)).rejects.toThrow(
      'DATA_MANAGEMENT_NOT_YOMITOMO_BACKUP',
    );
    expect(onDatabaseRestored).not.toHaveBeenCalled();
  });

  it('rejects backup files that require a newer database reader level', async () => {
    const filePath = join(testState.userData, 'too-new.sqlite');
    createYomitomoBackupFile(filePath, { readerLevel: 999 });
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null, onDatabaseRestored)).rejects.toThrow(
      'DATABASE_TOO_NEW',
    );
    expect(onDatabaseRestored).not.toHaveBeenCalled();
  });

  it('clears prior usage at replacement while reading the restored snapshot is pending', async () => {
    const filePath = join(testState.userData, 'valid.sqlite');
    createYomitomoBackupFile(filePath);
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });
    let telemetryEnabled = true;
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const telemetry = createReadingMemoryTelemetry({
      fetch: send,
      isEnabled: () => telemetryEnabled,
      endpoint: 'https://telemetry.invalid/counts',
      timeoutMs: 2000,
    });
    const snapshotStarted = deferred<void>();
    const snapshot = deferred<{ articles: never[]; providers: never[] }>();
    const store = { articles: [], providers: [] };
    testState.store.replaceDatabaseFile.mockImplementationOnce(async () => {
      telemetryEnabled = false;
      return 'safety-backup.sqlite';
    });
    testState.store.readStore.mockImplementationOnce(() => {
      snapshotStarted.resolve();
      return snapshot.promise;
    });
    onDatabaseRestored.mockImplementationOnce(() => {
      void telemetry.flush();
    });
    telemetry.record('feature_opened');
    const restoring = restoreDatabaseWithDialog(null, onDatabaseRestored);
    try {
      await snapshotStarted.promise;
      telemetryEnabled = true;
      await telemetry.flush();
      expect(onDatabaseRestored).toHaveBeenCalledOnce();
      expect(send).not.toHaveBeenCalled();
      telemetry.record('query_completed');
      await telemetry.flush();
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][1]?.body).toBe(JSON.stringify({ counts: { query_completed: 1 } }));
    } finally {
      snapshot.resolve(store);
      await restoring;
      telemetry.dispose();
    }
    expect(onDatabaseRestored).toHaveBeenCalledOnce();
  });
});

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function createYomitomoBackupFile(filePath: string, options?: { readerLevel?: number }) {
  const database = createSqliteFile(filePath);
  database.exec(`
CREATE TABLE __yomitomo_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
INSERT INTO __yomitomo_migrations (id, applied_at)
VALUES ('0001_initial', '2026-06-05T00:00:00.000Z');
CREATE TABLE __yomitomo_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
  if (options?.readerLevel !== undefined) {
    database
      .prepare('INSERT INTO __yomitomo_metadata (key, value) VALUES (?, ?)')
      .run(DATABASE_READER_LEVEL_KEY, String(options.readerLevel));
  }
  database.close();
}

function createSqliteFile(filePath: string) {
  return new SQLiteDatabase(filePath);
}
