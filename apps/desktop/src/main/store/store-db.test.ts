import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import BetterSqliteDatabase from 'better-sqlite3';
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
  const { default: SQLiteDatabaseDriver } = await import('better-sqlite3');
  return {
    loadSQLiteDatabase: () => SQLiteDatabaseDriver,
  };
});

import {
  backupDatabaseFile,
  closeDatabase,
  getDatabasePath,
  getSqliteExecutor,
  replaceDatabaseFile,
  runSqliteMaintenance,
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
      'DATA_MANAGEMENT_BACKUP_TARGET_IS_CURRENT_DATABASE',
    );
  });

  it('rejects restoring from the current database file', async () => {
    await expect(replaceDatabaseFile(getDatabasePath())).rejects.toThrow(
      'DATA_MANAGEMENT_RESTORE_SOURCE_IS_CURRENT_DATABASE',
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

  it('keeps an existing backup target when sqlite backup fails', async () => {
    writeMarker('current');
    const target = join(testPaths.userData, 'backup.sqlite');
    await writeFile(target, 'existing target');
    await writeFile(`${target}-wal`, 'existing wal');
    const sqlite = getSqliteExecutor();
    vi.spyOn(sqlite, 'backup').mockRejectedValueOnce(new Error('backup failed'));

    await expect(backupDatabaseFile(target)).rejects.toThrow('backup failed');

    await expect(readFile(target, 'utf8')).resolves.toBe('existing target');
    await expect(readFile(`${target}-wal`, 'utf8')).resolves.toBe('existing wal');
    expect(await backupTemporaryFiles(target)).toEqual([]);
  });

  it('replaces an existing backup target after sqlite backup succeeds', async () => {
    writeMarker('current');
    const target = join(testPaths.userData, 'backup.sqlite');
    await writeFile(target, 'existing target');
    await writeFile(`${target}-wal`, 'stale wal');

    await expect(backupDatabaseFile(target)).resolves.toBe(target);

    await expect(readFile(`${target}-wal`)).rejects.toThrow();
    expect(readMarkerFromDatabase(target)).toBe('current');
    expect(await backupTemporaryFiles(target)).toEqual([]);
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

describe('store database sqlite maintenance', () => {
  it('skips startup vacuum when reusable pages are below the threshold', () => {
    const database = maintenanceDatabase();
    try {
      const result = runSqliteMaintenance(database, {
        now: new Date('2026-06-22T00:00:00.000Z'),
        freelistThresholdBytes: Number.MAX_SAFE_INTEGER,
      });

      expect(result).toMatchObject({
        status: 'skipped',
        reason: 'freelist_below_threshold',
      });
      expect(readMaintenanceVacuumAt(database)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('records startup vacuum time and respects the maintenance interval', () => {
    const database = maintenanceDatabase();
    const firstVacuumAt = new Date('2026-06-22T00:00:00.000Z');
    try {
      const vacuumed = runSqliteMaintenance(database, {
        now: firstVacuumAt,
        freelistThresholdBytes: 0,
      });
      const skipped = runSqliteMaintenance(database, {
        now: new Date('2026-06-23T00:00:00.000Z'),
        freelistThresholdBytes: 0,
      });

      expect(vacuumed.status).toBe('vacuumed');
      expect(readMaintenanceVacuumAt(database)).toBe(firstVacuumAt.toISOString());
      expect(skipped).toMatchObject({
        status: 'skipped',
        reason: 'interval_not_due',
        lastVacuumAt: firstVacuumAt.toISOString(),
      });
    } finally {
      database.close();
    }
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

function readMarkerFromDatabase(filePath: string) {
  const database = new BetterSqliteDatabase(filePath, { readonly: true, fileMustExist: true });
  try {
    const row = database.prepare('SELECT value FROM rd509_marker WHERE id = 1').get();
    return isRecord(row) && typeof row.value === 'string' ? row.value : undefined;
  } finally {
    database.close();
  }
}

async function backupTemporaryFiles(target: string) {
  const temporaryFilePrefix = `${basename(target)}.tmp-`;
  const files = await actualFs.readdir(dirname(target));
  return files.filter((file) => file.startsWith(temporaryFilePrefix)).toSorted();
}

function maintenanceDatabase() {
  const database = new BetterSqliteDatabase(join(testPaths.userData, 'maintenance.sqlite'));
  database.pragma('journal_mode = WAL');
  return database;
}

function readMaintenanceVacuumAt(database: BetterSqliteDatabase.Database) {
  const row = database
    .prepare("SELECT last_vacuum_at FROM database_maintenance_state WHERE id = 'startup-vacuum'")
    .get();
  return isRecord(row) && typeof row.last_vacuum_at === 'string' ? row.last_vacuum_at : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
