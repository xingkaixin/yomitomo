import { existsSync, mkdirSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
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
  await mkdir(dirname(target), { recursive: true });
  await rm(target, { force: true });
  await removeSqliteSidecarFiles(target);
  database.pragma('wal_checkpoint(FULL)');
  await database.backup(target);
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
  if (existsSync(target)) await backupDatabaseFile(backupPath);

  closeDatabase();
  await mkdir(dirname(target), { recursive: true });
  await removeSqliteSidecarFiles(target);
  await copyFile(source, target);
  return backupPath;
}

export function purgeSqliteFiles() {
  if (!sqlite) return;
  sqlite.pragma('wal_checkpoint(TRUNCATE)');
  sqlite.exec('VACUUM');
}

async function safetyBackupPath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join(app.getPath('userData'), 'backups');
  await mkdir(directory, { recursive: true });
  return join(directory, `yomitomo-before-restore-${timestamp}.sqlite`);
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
