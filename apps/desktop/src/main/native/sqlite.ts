import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app } from 'electron';
import type SQLiteDatabase from 'better-sqlite3';

type SQLiteDatabaseConstructor = typeof SQLiteDatabase;

let sqliteConstructor: SQLiteDatabaseConstructor | null = null;

export function loadSQLiteDatabase(): SQLiteDatabaseConstructor {
  if (sqliteConstructor) return sqliteConstructor;

  const packagePath = join(electronNativeRoot(), 'node_modules', 'better-sqlite3', 'package.json');
  if (!existsSync(packagePath)) {
    throw new Error(
      `Electron native dependency root is missing better-sqlite3. Run "pnpm --filter @yomitomo/desktop rebuild:native" before starting the app. Missing: ${packagePath}`,
    );
  }

  sqliteConstructor = createRequire(packagePath)('better-sqlite3') as SQLiteDatabaseConstructor;
  return sqliteConstructor;
}

function electronNativeRoot() {
  if (process.env.YOMITOMO_ELECTRON_NATIVE_ROOT) {
    return process.env.YOMITOMO_ELECTRON_NATIVE_ROOT;
  }
  if (app.isPackaged) return join(process.resourcesPath, 'electron-native');
  return join(process.cwd(), 'electron-native');
}
