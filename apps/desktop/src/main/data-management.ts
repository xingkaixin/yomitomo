import { dirname, join } from 'node:path';
import {
  app,
  dialog,
  shell,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import type SQLiteDatabase from 'better-sqlite3';
import {
  assertDatabaseReaderCompatible,
  readAppliedDatabaseMigrationIds,
  readDatabaseReaderLevelIfPresent,
} from './db/compatibility';
import type {
  DataManagementPathKind,
  DataManagementPaths,
  DatabaseBackupResult,
  DatabaseRestoreResult,
} from '../ipc-contract';
import { readStore } from './store/store-snapshot';
import {
  backupDatabaseFile,
  getDataDirectoryPath,
  getDatabasePath,
  replaceDatabaseFile,
} from './store/store-db';
import { getLogPath } from './app/logger';
import { loadSQLiteDatabase } from './native/sqlite';

export function getDataManagementPaths(): DataManagementPaths {
  return {
    dataDir: getDataDirectoryPath(),
    logFile: getLogPath(),
    databaseFile: getDatabasePath(),
  };
}

export async function openDataManagementPath(kind: DataManagementPathKind) {
  const paths = getDataManagementPaths();
  if (kind === 'dataDir') {
    const error = await shell.openPath(paths.dataDir);
    if (error) throw new Error(error);
    return;
  }

  if (kind !== 'logFile' && kind !== 'databaseFile') {
    throw new Error('DATA_MANAGEMENT_UNKNOWN_PATH');
  }

  const file = kind === 'logFile' ? paths.logFile : paths.databaseFile;
  shell.showItemInFolder(file);
}

export async function backupDatabaseWithDialog(
  parentWindow: BrowserWindow | null,
): Promise<DatabaseBackupResult> {
  const result = await showSaveDatabaseDialog(parentWindow);
  if (result.canceled || !result.filePath) return { canceled: true };

  const filePath = await backupDatabaseFile(result.filePath);
  return { canceled: false, filePath };
}

export async function restoreDatabaseWithDialog(
  parentWindow: BrowserWindow | null,
): Promise<DatabaseRestoreResult> {
  const result = await showOpenDatabaseDialog(parentWindow);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return { canceled: true };

  validateDatabaseBackupFile(filePath);
  const backupPath = await replaceDatabaseFile(filePath);
  return {
    canceled: false,
    backupPath,
    store: await readStore(),
  };
}

function validateDatabaseBackupFile(filePath: string) {
  let database: SQLiteDatabase.Database;
  const SQLiteDatabase = loadSQLiteDatabase();
  try {
    database = new SQLiteDatabase(filePath, { readonly: true, fileMustExist: true });
  } catch (error) {
    throw new Error('DATA_MANAGEMENT_INVALID_SQLITE_DATABASE', { cause: error });
  }

  try {
    const integrity = checkDatabaseIntegrity(database);
    if (integrity !== 'ok') throw new Error('DATA_MANAGEMENT_DATABASE_INTEGRITY_FAILED');

    const migrationIds = readAppliedDatabaseMigrationIds(database);
    if (!migrationIds) throw new Error('DATA_MANAGEMENT_NOT_YOMITOMO_BACKUP');

    assertDatabaseReaderCompatible(migrationIds, readDatabaseReaderLevelIfPresent(database));
  } finally {
    database.close();
  }
}

function checkDatabaseIntegrity(database: SQLiteDatabase.Database) {
  try {
    return database.pragma('integrity_check', { simple: true });
  } catch (error) {
    throw new Error('DATA_MANAGEMENT_INVALID_SQLITE_DATABASE', { cause: error });
  }
}

function showSaveDatabaseDialog(parentWindow: BrowserWindow | null) {
  const options: SaveDialogOptions = {
    title: 'Back up Yomitomo database',
    defaultPath: join(app.getPath('documents'), `yomitomo-backup-${backupTimestamp()}.sqlite`),
    filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
  };
  return parentWindow
    ? dialog.showSaveDialog(parentWindow, options)
    : dialog.showSaveDialog(options);
}

function showOpenDatabaseDialog(parentWindow: BrowserWindow | null) {
  const options: OpenDialogOptions = {
    title: 'Restore Yomitomo database',
    defaultPath: dirname(getDatabasePath()),
    properties: ['openFile'],
    filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
  };
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, options)
    : dialog.showOpenDialog(options);
}

function backupTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}
