import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { app } from 'electron';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type SQLiteDatabase from 'better-sqlite3';
import {
  assertDatabaseReaderCompatible,
  databaseReaderCompatibility,
  ensureDatabaseCompatibilityTable,
  migrationReaderLevel,
  readDatabaseReaderLevel,
  writeDatabaseReaderLevel,
} from '../db/compatibility';
import { ensureAdditiveSchemaColumns, migrations } from '../db/migrations';
import * as schema from '../db/schema';
import { loadSQLiteDatabase } from '../native/sqlite';

const DB_FILE_NAME = 'yomitomo.sqlite';
const SQLITE_MAINTENANCE_STATE_ID = 'startup-vacuum';
const SQLITE_VACUUM_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const SQLITE_VACUUM_FREELIST_THRESHOLD_BYTES = 32 * 1024 * 1024;

let sqlite: SQLiteDatabase.Database | null = null;
let db: StoreDatabase | null = null;
let seedDatabase: ((database: StoreDatabase) => void) | null = null;

export type StoreDatabase = BetterSQLite3Database<typeof schema>;
export type StoreTransaction = Parameters<StoreDatabase['transaction']>[0] extends (
  tx: infer T,
) => unknown
  ? T
  : never;
export type StoreExecutor = StoreDatabase | StoreTransaction;
export type StoreReadProfileEntry = {
  name: string;
  durationMs: number;
  data?: Record<string, number>;
};
type SqliteMaintenanceStatement = {
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
};
type SqliteMaintenanceDatabase = {
  exec(sql: string): unknown;
  prepare(sql: string): SqliteMaintenanceStatement;
};
export type SqliteMaintenanceResult = {
  status: 'vacuumed' | 'skipped';
  reason?: 'freelist_below_threshold' | 'interval_not_due';
  freelistBytes: number;
  lastVacuumAt?: string;
};

export function configureStoreDatabaseSeeder(seeder: (database: StoreDatabase) => void) {
  seedDatabase = seeder;
}

function databasePath() {
  return join(app.getPath('userData'), DB_FILE_NAME);
}

export function getDataDirectoryPath() {
  return app.getPath('userData');
}

export function getDatabasePath() {
  return databasePath();
}

export function getDatabase() {
  if (db) return db;

  const file = databasePath();
  mkdirSync(dirname(file), { recursive: true });

  const SQLiteDatabase = loadSQLiteDatabase();
  sqlite = new SQLiteDatabase(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  try {
    runSqliteMaintenance(sqlite);
  } catch (error) {
    console.warn('[sqlite] startup maintenance failed', error);
  }

  db = drizzle(sqlite, { schema });
  seedDatabase?.(db);
  return db;
}

function getSqliteDatabase() {
  getDatabase();
  if (!sqlite) throw new Error('DATA_MANAGEMENT_DATABASE_NOT_OPEN');
  return sqlite;
}

export function getSqliteExecutor() {
  return getSqliteDatabase();
}

export async function backupDatabaseFile(targetPath: string) {
  const target = resolve(targetPath);
  const source = resolve(databasePath());
  if (target === source) throw new Error('DATA_MANAGEMENT_BACKUP_TARGET_IS_CURRENT_DATABASE');

  const database = getSqliteDatabase();
  const targetDirectory = dirname(target);
  const targetExists = existsSync(target);
  const temporaryTarget = temporaryBackupPath(target);
  await mkdir(targetDirectory, { recursive: true });
  database.pragma('wal_checkpoint(FULL)');
  try {
    await database.backup(temporaryTarget);
    await removeSqliteSidecarFiles(temporaryTarget);
    if (!targetExists) await removeSqliteSidecarFiles(target);
    await rename(temporaryTarget, target);
    if (targetExists) await removeSqliteSidecarFiles(target);
  } catch (error) {
    await removeBackupTemporaryFiles(temporaryTarget);
    throw error;
  }
  return target;
}

export function closeDatabase() {
  db = null;
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}

export async function replaceDatabaseFile(sourcePath: string) {
  const source = resolve(sourcePath);
  const target = resolve(databasePath());
  if (source === target) throw new Error('DATA_MANAGEMENT_RESTORE_SOURCE_IS_CURRENT_DATABASE');

  const backupPath = await safetyBackupPath();
  const targetExists = existsSync(target);
  if (targetExists) await backupDatabaseFile(backupPath);

  const temporaryTarget = temporaryRestorePath(target);
  const rollbackTarget = rollbackDatabasePath(target);
  let databaseClosed = false;
  let replacementInstalled = false;
  await mkdir(dirname(target), { recursive: true });
  try {
    await copyFile(source, temporaryTarget);
    validateRestoreCandidate(temporaryTarget);
    await removeSqliteSidecarFiles(temporaryTarget);

    closeDatabase();
    databaseClosed = true;
    await removeSqliteSidecarFiles(target);
    if (targetExists) {
      await copyFile(target, rollbackTarget);
    }
    await rename(temporaryTarget, target);
    replacementInstalled = true;
    getDatabase();
    databaseClosed = false;
    await removeBackupTemporaryFiles(rollbackTarget);
    return backupPath;
  } catch (error) {
    await removeBackupTemporaryFiles(temporaryTarget);
    if (databaseClosed) {
      await rollbackDatabaseReplacement({
        target,
        rollbackTarget,
        targetExists,
        replacementInstalled,
        restoreError: error,
      });
    }
    throw error;
  }
}

export function purgeSqliteFiles() {
  if (!sqlite) return;
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  sqlite.exec('VACUUM');
}

export function runSqliteMaintenance(
  database: SqliteMaintenanceDatabase,
  options: {
    now?: Date;
    minIntervalMs?: number;
    freelistThresholdBytes?: number;
  } = {},
): SqliteMaintenanceResult {
  const now = options.now || new Date();
  const minIntervalMs = options.minIntervalMs ?? SQLITE_VACUUM_INTERVAL_MS;
  const freelistThresholdBytes =
    options.freelistThresholdBytes ?? SQLITE_VACUUM_FREELIST_THRESHOLD_BYTES;

  ensureSqliteMaintenanceStateTable(database);
  database.exec('PRAGMA optimize');

  const freelistBytes =
    sqlitePragmaNumber(database, 'freelist_count') * sqlitePragmaNumber(database, 'page_size');
  if (freelistBytes < freelistThresholdBytes) {
    return { status: 'skipped', reason: 'freelist_below_threshold', freelistBytes };
  }

  const lastVacuumAt = readSqliteMaintenanceLastVacuumAt(database);
  if (lastVacuumAt && Date.parse(lastVacuumAt) + minIntervalMs > now.getTime()) {
    return { status: 'skipped', reason: 'interval_not_due', freelistBytes, lastVacuumAt };
  }

  database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  database.exec('VACUUM');
  writeSqliteMaintenanceLastVacuumAt(database, now.toISOString());
  return { status: 'vacuumed', freelistBytes, lastVacuumAt };
}

async function safetyBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(app.getPath('userData'), 'backups');
  await mkdir(directory, { recursive: true });
  return join(directory, `yomitomo-before-restore-${timestamp}.sqlite`);
}

function temporaryBackupPath(target: string) {
  return join(dirname(target), `${basename(target)}.tmp-${randomUUID()}`);
}

function temporaryRestorePath(target: string) {
  return join(dirname(target), `${basename(target)}.restore-${randomUUID()}`);
}

function rollbackDatabasePath(target: string) {
  return join(dirname(target), `${basename(target)}.rollback-${randomUUID()}`);
}

function validateRestoreCandidate(filePath: string) {
  const SQLiteDatabase = loadSQLiteDatabase();
  let candidate: SQLiteDatabase.Database;
  try {
    candidate = new SQLiteDatabase(filePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw new Error('DATA_MANAGEMENT_INVALID_SQLITE_DATABASE', { cause: error });
  }

  try {
    let integrity: unknown;
    try {
      integrity = candidate.pragma('integrity_check', { simple: true });
    } catch (error) {
      throw new Error('DATA_MANAGEMENT_INVALID_SQLITE_DATABASE', { cause: error });
    }
    if (integrity !== 'ok') {
      throw new Error('DATA_MANAGEMENT_DATABASE_INTEGRITY_FAILED');
    }
    try {
      candidate.prepare('SELECT id FROM __yomitomo_migrations LIMIT 1').get();
    } catch (error) {
      throw new Error('DATA_MANAGEMENT_NOT_YOMITOMO_BACKUP', { cause: error });
    }
  } finally {
    candidate.close();
  }
}

async function rollbackDatabaseReplacement(input: {
  target: string;
  rollbackTarget: string;
  targetExists: boolean;
  replacementInstalled: boolean;
  restoreError: unknown;
}) {
  closeDatabase();
  const recoveryErrors: unknown[] = [];

  if (input.targetExists && input.replacementInstalled) {
    await removeSqliteSidecarFiles(input.target).catch((error) => recoveryErrors.push(error));
    await rename(input.rollbackTarget, input.target).catch((error) => recoveryErrors.push(error));
  } else if (!input.targetExists && input.replacementInstalled) {
    await rm(input.target, { force: true }).catch((error) => recoveryErrors.push(error));
  }

  await removeBackupTemporaryFiles(input.rollbackTarget);

  if (input.targetExists) {
    try {
      getDatabase();
    } catch (error) {
      recoveryErrors.push(error);
    }
  }

  if (recoveryErrors.length > 0) {
    throw new AggregateError(
      [input.restoreError, ...recoveryErrors],
      'DATA_MANAGEMENT_RESTORE_ROLLBACK_FAILED',
    );
  }
}

async function removeBackupTemporaryFiles(filePath: string) {
  await Promise.allSettled([rm(filePath, { force: true }), removeSqliteSidecarFiles(filePath)]);
}

async function removeSqliteSidecarFiles(filePath: string) {
  await Promise.all([
    rm(`${filePath}-wal`, { force: true }),
    rm(`${filePath}-shm`, { force: true }),
  ]);
}

function runMigrations(database: SQLiteDatabase.Database) {
  database.exec(`
CREATE TABLE IF NOT EXISTS __yomitomo_migrations (
  id TEXT PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
`);

  const applied = new Set(
    database
      .prepare('SELECT id FROM __yomitomo_migrations')
      .all()
      .map((row) => stringField(recordField(row, 'id'))),
  );

  ensureDatabaseCompatibilityTable(database);
  let readerLevel = assertDatabaseReaderCompatible(applied, readDatabaseReaderLevel(database));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO __yomitomo_migrations (id, applied_at) VALUES (?, ?)')
        .run(migration.id, new Date().toISOString());
      readerLevel = Math.max(readerLevel, migrationReaderLevel(migration));
      writeDatabaseReaderLevel(database, readerLevel);
    })();
    applied.add(migration.id);
  }

  ensureAdditiveSchemaColumns(database);

  const compatibility = databaseReaderCompatibility(applied, readDatabaseReaderLevel(database));
  writeDatabaseReaderLevel(database, compatibility.requiredReaderLevel);
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function ensureSqliteMaintenanceStateTable(database: SqliteMaintenanceDatabase) {
  database.exec(`
CREATE TABLE IF NOT EXISTS database_maintenance_state (
  id TEXT PRIMARY KEY NOT NULL,
  last_vacuum_at TEXT,
  updated_at TEXT NOT NULL
);
`);
}

function sqlitePragmaNumber(database: SqliteMaintenanceDatabase, name: string) {
  return numberField(recordField(database.prepare(`PRAGMA ${name}`).get(), name));
}

function readSqliteMaintenanceLastVacuumAt(database: SqliteMaintenanceDatabase) {
  const value = recordField(
    database
      .prepare('SELECT last_vacuum_at FROM database_maintenance_state WHERE id = ?')
      .get(SQLITE_MAINTENANCE_STATE_ID),
    'last_vacuum_at',
  );
  return typeof value === 'string' && value ? value : undefined;
}

function writeSqliteMaintenanceLastVacuumAt(
  database: SqliteMaintenanceDatabase,
  lastVacuumAt: string,
) {
  database
    .prepare(
      `
INSERT INTO database_maintenance_state (id, last_vacuum_at, updated_at)
VALUES (?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  last_vacuum_at = excluded.last_vacuum_at,
  updated_at = excluded.updated_at
`,
    )
    .run(SQLITE_MAINTENANCE_STATE_ID, lastVacuumAt, lastVacuumAt);
}
