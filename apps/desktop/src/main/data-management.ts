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
import {
  backupDatabaseFile,
  getDataDirectoryPath,
  getDatabasePath,
  readStore,
  replaceDatabaseFile,
} from './store/store';
import { getLogPath } from './app/logger';
import { loadSQLiteDatabase } from './native/sqlite';

export type DataManagementPathKind = 'dataDir' | 'logFile' | 'databaseFile';

export type DataManagementPaths = {
  dataDir: string;
  logFile: string;
  databaseFile: string;
};

export type DatabaseBackupResult = { canceled: true } | { canceled: false; filePath: string };

export type DatabaseRestoreResult =
  | { canceled: true }
  | {
      canceled: false;
      backupPath: string;
      store: Awaited<ReturnType<typeof readStore>>;
    };

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
    throw new Error('未知的数据路径');
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
    throw new Error('请选择有效的 SQLite 数据库文件', { cause: error });
  }

  try {
    const integrity = database.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') throw new Error('数据库完整性检查失败');

    const migrationIds = readAppliedDatabaseMigrationIds(database);
    if (!migrationIds) throw new Error('这不是 Yomitomo 数据库备份文件');

    assertDatabaseReaderCompatible(migrationIds, readDatabaseReaderLevelIfPresent(database));
  } finally {
    database.close();
  }
}

function showSaveDatabaseDialog(parentWindow: BrowserWindow | null) {
  const options: SaveDialogOptions = {
    title: '备份 Yomitomo 数据库',
    defaultPath: join(app.getPath('documents'), `yomitomo-backup-${backupTimestamp()}.sqlite`),
    filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db'] }],
  };
  return parentWindow
    ? dialog.showSaveDialog(parentWindow, options)
    : dialog.showSaveDialog(options);
}

function showOpenDatabaseDialog(parentWindow: BrowserWindow | null) {
  const options: OpenDialogOptions = {
    title: '还原 Yomitomo 数据库',
    defaultPath: dirname(getDatabasePath()),
    properties: ['openFile'],
    filters: [{ name: 'SQLite 数据库', extensions: ['sqlite', 'db'] }],
  };
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, options)
    : dialog.showOpenDialog(options);
}

function backupTimestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
}
