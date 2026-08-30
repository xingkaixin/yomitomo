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
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  };
});

// The real logger appends to a file under the mocked userData directory, which races
// with the per-test cleanup of that directory.
vi.mock('../app/logger', () => ({
  logInfo: vi.fn(),
}));

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
  readDatabaseLifecycle,
  replaceDatabaseFile,
  runSqliteMaintenance,
  withDatabaseLease,
} from './store-db';
import { copyFile, rename, rm } from 'node:fs/promises';
import { migrations } from '../db/migrations';

const actualFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(copyFile).mockImplementation(actualFs.copyFile);
  vi.mocked(rename).mockImplementation(actualFs.rename);
  vi.mocked(rm).mockImplementation(actualFs.rm);
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
    expect(await restoreTemporaryFiles()).toEqual([]);
  });

  it('restores judgment revisions and complete review history from a native backup', async () => {
    const sqlite = getSqliteExecutor();
    writeReadingJudgments(sqlite);
    sqlite.exec(`
UPDATE comments SET asset_revision = 'comment-version-original' WHERE id = 'backup-comment';
UPDATE annotations
SET distillation_revision = 'distillation-version-original'
WHERE id = 'backup-annotation';

INSERT INTO reading_memory_reviews (
  id, article_id, annotation_id, asset_type, asset_id, asset_version,
  judgment_snapshot, judgment_digest, previous_review_id, decision, answer, created_at
) VALUES
  (
    'review-comment-1', 'backup-article', 'backup-annotation', 'comment', 'backup-comment',
    'comment-version-original', '旧评论判断', 'comment-digest-original', NULL,
    'still_agree', '仍然同意原判断', '2026-08-28T00:00:00.000Z'
  ),
  (
    'review-comment-2', 'backup-article', 'backup-annotation', 'comment', 'backup-comment',
    'comment-version-original', '旧评论判断', 'comment-digest-original', 'review-comment-1',
    'need_evidence', '', '2026-08-29T00:00:00.000Z'
  ),
  (
    'review-distillation', 'backup-article', 'backup-annotation', 'distillation',
    'backup-annotation', 'distillation-version-original', '旧提炼判断',
    'distillation-digest-original', NULL, 'changed', '新的提炼判断',
    '2026-08-29T01:00:00.000Z'
  );
`);
    const original = readReadingJudgmentBackupState(sqlite);
    const source = join(testPaths.userData, 'reading-reviews.sqlite');
    await backupDatabaseFile(source);
    sqlite.exec(`
UPDATE comments
SET content = '备份后的评论', asset_revision = 'comment-version-current'
WHERE id = 'backup-comment';
UPDATE annotations
SET distillation_content = '备份后的提炼', distillation_revision = 'distillation-version-current'
WHERE id = 'backup-annotation';
DELETE FROM reading_memory_reviews;
`);
    expect(readReadingJudgmentBackupState(sqlite)).not.toEqual(original);

    await replaceDatabaseFile(source);

    expect(readReadingJudgmentBackupState(getSqliteExecutor())).toEqual(original);
  });

  it('migrates a reader-level-2 backup without changing judgments or inventing reviews', async () => {
    const source = join(testPaths.userData, 'legacy-reading-judgments.sqlite');
    const legacy = new BetterSqliteDatabase(':memory:');
    try {
      legacy.exec(`
CREATE TABLE __yomitomo_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE __yomitomo_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
INSERT INTO __yomitomo_metadata (key, value) VALUES ('database_reader_level', '2');
`);
      const recordMigration = legacy.prepare(
        'INSERT INTO __yomitomo_migrations (id, applied_at) VALUES (?, ?)',
      );
      for (const migration of migrations) {
        if (migration.id > '0070_reading_memory_remote_consent') break;
        legacy.exec(migration.sql);
        recordMigration.run(migration.id, '2026-08-28T00:00:00.000Z');
      }
      writeReadingJudgments(legacy);
      expect(
        legacy.prepare('SELECT id FROM __yomitomo_migrations ORDER BY id DESC LIMIT 1').get(),
      ).toEqual({ id: '0070_reading_memory_remote_consent' });
      await legacy.backup(source);
    } finally {
      legacy.close();
    }
    writeMarker('current');

    await replaceDatabaseFile(source);

    const restored = getSqliteExecutor();
    expect(readReadingJudgmentBackupState(restored)).toEqual({
      judgment: {
        content: '旧评论判断',
        asset_revision: expect.stringMatching(/\S/),
        distillation_status: 'published',
        distillation_content: '旧提炼判断',
        distillation_revision: expect.stringMatching(/\S/),
      },
      reviews: [],
    });
    expect(
      restored
        .prepare('SELECT id FROM __yomitomo_migrations WHERE id = ?')
        .get('0071_reading_memory_reviews'),
    ).toEqual({ id: '0071_reading_memory_reviews' });
    expect(
      restored
        .prepare("SELECT value FROM __yomitomo_metadata WHERE key = 'database_reader_level'")
        .get(),
    ).toEqual({ value: '3' });
  });

  it('keeps the current database file when restore copy fails', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    vi.mocked(copyFile).mockImplementation(async (from, to) => {
      if (String(to).includes('.restore-')) throw new Error('copy failed');
      return actualFs.copyFile(from, to);
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('copy failed');

    expect(readMarker()).toBe('current');
  });

  it('keeps the current database usable when restore copy writes partially before failing', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    vi.mocked(copyFile).mockImplementation(async (from, to) => {
      if (!String(to).includes('.restore-')) return actualFs.copyFile(from, to);
      await actualFs.writeFile(to, 'partial restore');
      throw new Error('copy failed after partial write');
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('copy failed after partial write');

    expect(readMarker()).toBe('current');
    expect(await restoreTemporaryFiles()).toEqual([]);
  });

  it('keeps the current database open when the copied restore file is invalid', async () => {
    writeMarker('current');
    const source = join(testPaths.userData, 'invalid.sqlite');
    await writeFile(source, 'not sqlite');

    await expect(replaceDatabaseFile(source)).rejects.toThrow(
      'DATA_MANAGEMENT_INVALID_SQLITE_DATABASE',
    );

    expect(readMarker()).toBe('current');
    expect(await restoreTemporaryFiles()).toEqual([]);
  });

  it('reopens the current database when creating the rollback snapshot fails', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const databasePath = getDatabasePath();
    vi.mocked(copyFile).mockImplementation(async (from, to) => {
      if (String(from) === databasePath && String(to).includes('.rollback-')) {
        await actualFs.writeFile(to, 'partial rollback');
        throw new Error('rollback copy failed');
      }
      return actualFs.copyFile(from, to);
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('rollback copy failed');

    expect(readMarker()).toBe('current');
    expect(await restoreTemporaryFiles()).toEqual([]);
  });

  it('rolls back when installing the copied database fails', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const databasePath = getDatabasePath();
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('.restore-') && String(to) === databasePath) {
        throw new Error('install rename failed');
      }
      return actualFs.rename(from, to);
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('install rename failed');

    expect(readMarker()).toBe('current');
    expect(await restoreTemporaryFiles()).toEqual([]);
  });

  it('rolls back when the replacement database cannot be reopened', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const databasePath = getDatabasePath();
    vi.mocked(rename).mockImplementation(async (from, to) => {
      await actualFs.rename(from, to);
      if (String(from).includes('.restore-') && String(to) === databasePath) {
        await actualFs.writeFile(databasePath, 'invalid replacement');
        await actualFs.writeFile(`${databasePath}-wal`, 'stale replacement wal');
        await actualFs.writeFile(`${databasePath}-shm`, 'stale replacement shm');
      }
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow();

    expect(readMarker()).toBe('current');
    await expect(readOptionalFile(`${databasePath}-wal`)).resolves.not.toContain(
      'stale replacement',
    );
    await expect(readOptionalFile(`${databasePath}-shm`)).resolves.not.toContain(
      'stale replacement',
    );
    expect(await restoreTemporaryFiles()).toEqual([]);
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
    expect(await restoreTemporaryFiles()).toEqual([]);
  });
});

describe('store database restore lifecycle', () => {
  it('refuses to reopen the database while the file is being replaced', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const generationBeforeRestore = readDatabaseLifecycle().generation;
    const lifecycleDuringRename: string[] = [];
    const reopenAttempts: unknown[] = [];
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('.restore-')) {
        lifecycleDuringRename.push(readDatabaseLifecycle().state);
        reopenAttempts.push(runCatching(() => getSqliteExecutor()));
        reopenAttempts.push(await runCatchingAsync(() => withDatabaseLease(async () => 'read')));
      }
      return actualFs.rename(from, to);
    });

    await replaceDatabaseFile(source);

    expect(lifecycleDuringRename).toEqual(['replacing']);
    expect(reopenAttempts).toEqual([
      new Error('DATA_MANAGEMENT_DATABASE_REPLACING'),
      new Error('DATA_MANAGEMENT_DATABASE_REPLACING'),
    ]);
    expect(readMarker()).toBe('source');
    expect(readDatabaseLifecycle()).toMatchObject({
      state: 'open',
      generation: generationBeforeRestore + 1,
    });
  });

  it('waits for in-flight leases before closing the database', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    let releaseLease: () => void = noop;
    const leaseHeld = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    const leaseStates: string[] = [];

    const lease = withDatabaseLease(async () => {
      await leaseHeld;
      leaseStates.push(readDatabaseLifecycle().state);
      return readMarker();
    });
    const restore = replaceDatabaseFile(source);
    expect(readDatabaseLifecycle()).toMatchObject({ state: 'draining', leases: 1 });
    releaseLease();

    expect(await lease).toBe('current');
    await restore;
    expect(leaseStates).toEqual(['draining']);
    expect(readMarker()).toBe('source');
  });

  it('keeps the current database when a lease does not drain in time', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    const generationBeforeRestore = readDatabaseLifecycle().generation;
    let releaseLease: () => void = noop;
    const leaseHeld = new Promise<void>((resolve) => {
      releaseLease = resolve;
    });
    const lease = withDatabaseLease(async () => leaseHeld);

    vi.useFakeTimers();
    try {
      const restore = replaceDatabaseFile(source);
      expect(readDatabaseLifecycle()).toMatchObject({ state: 'draining', leases: 1 });
      vi.advanceTimersByTime(5000);
      vi.useRealTimers();
      await expect(restore).rejects.toThrow('DATA_MANAGEMENT_DATABASE_BUSY');

      expect(readMarker()).toBe('current');
      expect(readDatabaseLifecycle()).toMatchObject({
        state: 'open',
        generation: generationBeforeRestore,
        leases: 1,
      });
    } finally {
      releaseLease();
      await lease;
      vi.useRealTimers();
    }
  });

  it('refuses a second restore while one is already running', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    let concurrentRestore: unknown;
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('.restore-')) {
        concurrentRestore = await runCatchingAsync(() => replaceDatabaseFile(source));
      }
      return actualFs.rename(from, to);
    });

    await replaceDatabaseFile(source);

    expect(concurrentRestore).toEqual(new Error('DATA_MANAGEMENT_DATABASE_REPLACING'));
  });

  it('returns to a usable connection after a failed restore', async () => {
    writeMarker('source');
    const source = join(testPaths.userData, 'source.sqlite');
    await backupDatabaseFile(source);
    writeMarker('current');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (String(from).includes('.restore-')) throw new Error('install rename failed');
      return actualFs.rename(from, to);
    });

    await expect(replaceDatabaseFile(source)).rejects.toThrow('install rename failed');

    expect(readDatabaseLifecycle().state).toBe('open');
    writeMarker('after failure');
    expect(readMarker()).toBe('after failure');
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

function writeReadingJudgments(database: BetterSqliteDatabase.Database) {
  database.exec(`
INSERT INTO articles (
  id, url, canonical_url, title, content_hash, created_at, updated_at
) VALUES (
  'backup-article', 'https://example.com/backup', 'https://example.com/backup',
  '备份资料', 'backup-content-hash', '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z'
);
INSERT INTO annotations (
  id, article_id, anchor, author, color, created_at, updated_at,
  distillation_status, distillation_content
) VALUES (
  'backup-annotation', 'backup-article', '{}', 'user', 'yellow',
  '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z', 'published', '旧提炼判断'
);
INSERT INTO comments (id, annotation_id, author, content, created_at)
VALUES (
  'backup-comment', 'backup-annotation', 'user', '旧评论判断', '2026-08-27T00:00:00.000Z'
);
`);
}

function readReadingJudgmentBackupState(database: BetterSqliteDatabase.Database) {
  return {
    judgment: database
      .prepare(
        `SELECT comment.content, comment.asset_revision,
                annotation.distillation_status, annotation.distillation_content,
                annotation.distillation_revision
         FROM comments comment JOIN annotations annotation ON annotation.id = comment.annotation_id
         WHERE comment.id = 'backup-comment'`,
      )
      .get(),
    reviews: database.prepare('SELECT * FROM reading_memory_reviews ORDER BY id').all(),
  };
}

async function backupTemporaryFiles(target: string) {
  const temporaryFilePrefix = `${basename(target)}.tmp-`;
  const files = await actualFs.readdir(dirname(target));
  return files.filter((file) => file.startsWith(temporaryFilePrefix)).toSorted();
}

async function restoreTemporaryFiles() {
  const files = await actualFs.readdir(testPaths.userData);
  return files.filter((file) => /\.(?:restore|rollback)-/.test(file)).toSorted();
}

async function readOptionalFile(filePath: string) {
  return actualFs.readFile(filePath, 'utf8').catch(() => '');
}

function noop() {}

function runCatching(operation: () => unknown) {
  try {
    return operation();
  } catch (error) {
    return error;
  }
}

async function runCatchingAsync(operation: () => Promise<unknown>) {
  return operation().catch((error: unknown) => error);
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
