import type SQLiteDatabase from 'better-sqlite3';
import {
  assertDatabaseReaderCompatible,
  readAppliedDatabaseMigrationIds,
  readDatabaseReaderLevelIfPresent,
} from './compatibility';
import { loadSQLiteDatabase } from '../native/sqlite';

export function validateDatabaseBackupFile(filePath: string) {
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
