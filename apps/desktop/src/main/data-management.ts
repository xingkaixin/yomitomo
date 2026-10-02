import { dirname, join } from 'node:path';
import {
  app,
  dialog,
  shell,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import { validateDatabaseBackupFile } from './db/backup-validation';
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
import { createFullBackup, restoreFullBackup } from './full-backup';
import { getLogPath } from './app/logger';

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
  onDatabaseRestored: () => void,
): Promise<DatabaseRestoreResult> {
  const result = await showOpenDatabaseDialog(parentWindow);
  const filePath = result.filePaths[0];
  if (result.canceled || !filePath) return { canceled: true };

  validateDatabaseBackupFile(filePath);
  const backupPath = await replaceDatabaseFile(filePath);
  onDatabaseRestored();
  return {
    canceled: false,
    backupPath,
    store: await readStore(),
  };
}

export async function backupFullDataWithDialog(
  parentWindow: BrowserWindow | null,
): Promise<DatabaseBackupResult> {
  const result = await showBackupDirectoryDialog(
    parentWindow,
    'Choose where to save a complete backup',
  );
  const directory = result.filePaths[0];
  if (result.canceled || !directory) return { canceled: true };
  return { canceled: false, filePath: await createFullBackup(directory) };
}

export async function restoreFullDataWithDialog(
  parentWindow: BrowserWindow | null,
  onDatabaseRestored: () => void,
): Promise<DatabaseRestoreResult> {
  const result = await showBackupDirectoryDialog(
    parentWindow,
    'Choose a complete Yomitomo backup folder',
  );
  const directory = result.filePaths[0];
  if (result.canceled || !directory) return { canceled: true };
  const backupPath = await restoreFullBackup(directory);
  onDatabaseRestored();
  return { canceled: false, backupPath, store: await readStore() };
}

function showBackupDirectoryDialog(parentWindow: BrowserWindow | null, title: string) {
  const options: OpenDialogOptions = {
    title,
    defaultPath: app.getPath('documents'),
    properties: ['openDirectory', 'createDirectory'],
  };
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, options)
    : dialog.showOpenDialog(options);
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
