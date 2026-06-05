import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testPaths = vi.hoisted(() => ({
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => testPaths.userData,
  },
}));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    copyFile: vi.fn(actual.copyFile),
    rm: vi.fn(actual.rm),
  };
});

vi.mock('../native/sqlite', async () => {
  const { default: SQLiteDatabase } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabase,
  };
});

import {
  backupDatabaseFile,
  closeDatabase,
  getDatabasePath,
  getSqliteExecutor,
  replaceDatabaseFile,
} from './store-db';
import { copyFile, rm } from 'node:fs/promises';

const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

beforeEach(async () => {
  vi.clearAllMocks();
  closeDatabase();
  testPaths.userData = await actualFs.mkdtemp(join(tmpdir(), 'yomitomo-store-db-test-'));
});

afterEach(async () => {
  closeDatabase();
  await actualFs.rm(testPaths.userData, { recursive: true, force: true });
  testPaths.userData = '';
});

describe('store database backup and restore', () => {
  it('rejects backing up to the current database file', async () => {
    await expect(backupDatabaseFile(getDatabasePath())).rejects.toThrow(
      '不能把备份保存到当前数据库文件',
    );
  });

  it('rejects restoring from the current database file', async () => {
    await expect(replaceDatabaseFile(getDatabasePath())).rejects.toThrow(
      '不能从当前数据库文件还原',
    );
  });

  it('surfaces backup filesystem failures before writing a target file', async () => {
    writeMarker('current');
    const blockedDirectory = join(testPaths.userData, 'blocked-parent');
    await writeFile(blockedDirectory, 'not a directory');
    const target = join(blockedDirectory, 'backup.sqlite');

    await expect(backupDatabaseFile(target)).rejects.toThrow();

    await expect(readFile(target)).rejects.toThrow();
  });

  it('surfaces backup sidecar cleanup failures', async () => {
    writeMarker('current');
    const target = join(testPaths.userData, 'backup.sqlite');
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path) === `${target}-wal`) throw new Error('sidecar cleanup failed');
      return actualFs.rm(path, options);
    });

    await expect(backupDatabaseFile(target)).rejects.toThrow('sidecar cleanup failed');

    await expect(readFile(target)).rejects.toThrow();
  });

  it('creates a safety backup before restoring another database file', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');

    const safetyBackup = await replaceDatabaseFile(source);

    expect(safetyBackup).toContain(join(testPaths.userData, 'backups'));
    await expect(readFile(safetyBackup)).resolves.toBeInstanceOf(Buffer);
    expect(readMarker()).toBe('source');
  });

  it('keeps the current database file when restore copy fails', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    vi.mocked(copyFile).mockRejectedValueOnce(new Error('copy failed'));

    await expect(replaceDatabaseFile(source)).rejects.toThrow('copy failed');

    expect(readMarker()).toBe('current');
  });

  it('keeps the current database file when restore sidecar cleanup fails', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const databasePath = getDatabasePath();
    vi.mocked(rm).mockImplementation(async (path, options) => {
      if (String(path) === `${databasePath}-wal`) throw new Error('sidecar cleanup failed');
      return actualFs.rm(path, options);
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('sidecar cleanup failed');

    expect(readMarker()).toBe('current');
    expect(vi.mocked(copyFile)).not.toHaveBeenCalled();
  });
});

function writeMarker(value: string) {
  const sqlite = getSqliteExecutor();
  sqlite.exec(`
CREATE TABLE IF NOT EXISTS rd509_marker (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL
);
`);
  sqlite.prepare('INSERT OR REPLACE INTO rd509_marker (id, value) VALUES (1, ?)').run(value);
}

function readMarker() {
  const row = getSqliteExecutor().prepare('SELECT value FROM rd509_marker WHERE id = 1').get();
  return isRecord(row) && typeof row.value === 'string' ? row.value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
