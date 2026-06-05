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
  sqliteConstructor: null as unknown,
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

vi.mock('./store/store', () => ({
  backupDatabaseFile: testState.store.backupDatabaseFile,
  getDataDirectoryPath: () => testState.userData,
  getDatabasePath: () => join(testState.userData, 'yomitomo.sqlite'),
  readStore: testState.store.readStore,
  replaceDatabaseFile: testState.store.replaceDatabaseFile,
}));

vi.mock('./native/sqlite', () => ({
  loadSQLiteDatabase: () => testState.sqliteConstructor || SQLiteDatabase,
}));

import {
  backupDatabaseWithDialog,
  openDataManagementPath,
  restoreDatabaseWithDialog,
} from './data-management';
import { DATABASE_READER_LEVEL_KEY } from './db/compatibility';

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), 'yomitomo-data-management-test-'));
  testState.root = root;
  testState.appData = join(root, 'app-data');
  testState.userData = join(root, 'user-data');
  testState.documents = join(root, 'documents');
  await mkdir(testState.appData, { recursive: true });
  await mkdir(testState.userData, { recursive: true });
  await mkdir(testState.documents, { recursive: true });
  testState.sqliteConstructor = null;
  vi.clearAllMocks();
});

afterEach(async () => {
  await rm(testState.root, { recursive: true, force: true });
  testState.root = '';
});

describe('data management path opening', () => {
  it('opens the data directory path', async () => {
    testState.shell.openPath.mockResolvedValue('');

    await openDataManagementPath('dataDir');

    expect(testState.shell.openPath).toHaveBeenCalledWith(testState.userData);
    expect(testState.shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it('throws when opening the data directory fails', async () => {
    testState.shell.openPath.mockResolvedValue('failed to open');

    await expect(openDataManagementPath('dataDir')).rejects.toThrow('failed to open');
  });

  it('shows the log file and database file in their folder', async () => {
    await openDataManagementPath('logFile');
    await openDataManagementPath('databaseFile');

    expect(testState.shell.showItemInFolder).toHaveBeenCalledWith(
      join(testState.userData, 'yomitomo-agent.log'),
    );
    expect(testState.shell.showItemInFolder).toHaveBeenCalledWith(
      join(testState.userData, 'yomitomo.sqlite'),
    );
  });

  it('rejects unknown path kinds', async () => {
    await expect(openDataManagementPath('unknown' as never)).rejects.toThrow('未知的数据路径');
  });
});

describe('database backup dialog', () => {
  it('returns canceled when the save dialog is canceled', async () => {
    testState.dialog.showSaveDialog.mockResolvedValue({ canceled: true });

    await expect(backupDatabaseWithDialog(null)).resolves.toEqual({ canceled: true });

    expect(testState.store.backupDatabaseFile).not.toHaveBeenCalled();
  });

  it('backs up the database to the selected file', async () => {
    const selectedPath = join(testState.documents, 'backup.sqlite');
    const backupPath = join(testState.documents, 'created-backup.sqlite');
    testState.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPath });
    testState.store.backupDatabaseFile.mockResolvedValue(backupPath);

    await expect(backupDatabaseWithDialog(null)).resolves.toEqual({
      canceled: false,
      filePath: backupPath,
    });

    expect(testState.store.backupDatabaseFile).toHaveBeenCalledWith(selectedPath);
  });

  it('surfaces backup failures from the store boundary', async () => {
    const selectedPath = join(testState.documents, 'backup.sqlite');
    testState.dialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: selectedPath });
    testState.store.backupDatabaseFile.mockRejectedValue(new Error('backup failed'));

    await expect(backupDatabaseWithDialog(null)).rejects.toThrow('backup failed');
  });
});

describe('database restore dialog', () => {
  it('returns canceled when the open dialog is canceled', async () => {
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(restoreDatabaseWithDialog(null)).resolves.toEqual({ canceled: true });

    expect(testState.store.replaceDatabaseFile).not.toHaveBeenCalled();
  });

  it('rejects files that are not SQLite databases', async () => {
    const filePath = join(testState.userData, 'not-sqlite.sqlite');
    await writeFile(filePath, 'not a sqlite database');
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null)).rejects.toThrow('请选择有效的 SQLite 数据库文件');
  });

  it('rejects backup files that fail integrity check', async () => {
    const filePath = join(testState.userData, 'broken.sqlite');
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });
    testState.sqliteConstructor = class {
      pragma() {
        return 'not ok';
      }

      close() {}
    };

    await expect(restoreDatabaseWithDialog(null)).rejects.toThrow('数据库完整性检查失败');
  });

  it('rejects SQLite files without Yomitomo migration metadata', async () => {
    const filePath = join(testState.userData, 'plain.sqlite');
    createSqliteFile(filePath);
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null)).rejects.toThrow('这不是 Yomitomo 数据库备份文件');
  });

  it('rejects backup files that require a newer database reader level', async () => {
    const filePath = join(testState.userData, 'too-new.sqlite');
    createYomitomoBackupFile(filePath, { readerLevel: 999 });
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });

    await expect(restoreDatabaseWithDialog(null)).rejects.toThrow(
      '这份本地数据库需要 reader level 999',
    );
  });

  it('restores a valid backup file and returns the refreshed store', async () => {
    const filePath = join(testState.userData, 'valid.sqlite');
    const backupPath = join(testState.userData, 'backups', 'before-restore.sqlite');
    const store = { articles: [], providers: [] };
    createYomitomoBackupFile(filePath);
    testState.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] });
    testState.store.replaceDatabaseFile.mockResolvedValue(backupPath);
    testState.store.readStore.mockResolvedValue(store);

    await expect(restoreDatabaseWithDialog(null)).resolves.toEqual({
      canceled: false,
      backupPath,
      store,
    });
    expect(testState.store.replaceDatabaseFile).toHaveBeenCalledWith(filePath);
    expect(testState.store.readStore).toHaveBeenCalledOnce();
  });
});

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
