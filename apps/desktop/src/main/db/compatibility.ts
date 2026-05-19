import type SQLiteDatabase from 'better-sqlite3';

import { migrations, type DatabaseMigration } from './migrations';

const DEFAULT_DATABASE_READER_LEVEL = 1;
export const SUPPORTED_DATABASE_READER_LEVEL = 2;
export const DATABASE_READER_LEVEL_KEY = 'database_reader_level';

export class DatabaseTooNewError extends Error {
  readonly code = 'DATABASE_TOO_NEW';
  readonly requiredReaderLevel: number;
  readonly supportedReaderLevel: number;
  readonly unknownMigrationIds: string[];

  constructor(options: {
    requiredReaderLevel: number;
    supportedReaderLevel: number;
    unknownMigrationIds?: string[];
  }) {
    super(
      `这份本地数据库需要 reader level ${options.requiredReaderLevel}，当前应用只支持到 ${options.supportedReaderLevel}。`,
    );
    this.name = 'DatabaseTooNewError';
    this.requiredReaderLevel = options.requiredReaderLevel;
    this.supportedReaderLevel = options.supportedReaderLevel;
    this.unknownMigrationIds = options.unknownMigrationIds || [];
  }
}

export function ensureDatabaseCompatibilityTable(database: SQLiteDatabase.Database) {
  database.exec(`
CREATE TABLE IF NOT EXISTS __yomitomo_metadata (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`);
}

export function readDatabaseReaderLevel(database: SQLiteDatabase.Database) {
  const row = database
    .prepare('SELECT value FROM __yomitomo_metadata WHERE key = ?')
    .get(DATABASE_READER_LEVEL_KEY) as { value?: string } | undefined;
  if (!row) return null;

  const level = Number(row.value);
  if (!Number.isInteger(level) || level < DEFAULT_DATABASE_READER_LEVEL) {
    throw new Error('本地数据库兼容性元数据无效');
  }
  return level;
}

export function readDatabaseReaderLevelIfPresent(database: SQLiteDatabase.Database) {
  if (!databaseTableExists(database, '__yomitomo_metadata')) return null;
  return readDatabaseReaderLevel(database);
}

export function readAppliedDatabaseMigrationIds(database: SQLiteDatabase.Database) {
  if (!databaseTableExists(database, '__yomitomo_migrations')) return null;
  return database
    .prepare('SELECT id FROM __yomitomo_migrations')
    .all()
    .map((row) => String((row as { id: string }).id));
}

export function writeDatabaseReaderLevel(database: SQLiteDatabase.Database, readerLevel: number) {
  database
    .prepare(
      `
INSERT INTO __yomitomo_metadata (key, value)
VALUES (?, ?)
ON CONFLICT(key) DO UPDATE SET value = excluded.value
`,
    )
    .run(DATABASE_READER_LEVEL_KEY, String(readerLevel));
}

export function migrationReaderLevel(migration: DatabaseMigration) {
  return migration.minReaderLevel ?? DEFAULT_DATABASE_READER_LEVEL;
}

export function databaseReaderCompatibility(
  appliedMigrationIds: Iterable<string>,
  storedReaderLevel: number | null,
) {
  const knownMigrations = new Map(migrations.map((migration) => [migration.id, migration]));
  const unknownMigrationIds: string[] = [];
  let requiredReaderLevel = storedReaderLevel ?? DEFAULT_DATABASE_READER_LEVEL;

  for (const id of appliedMigrationIds) {
    const migration = knownMigrations.get(id);
    if (!migration) {
      unknownMigrationIds.push(id);
      continue;
    }
    requiredReaderLevel = Math.max(requiredReaderLevel, migrationReaderLevel(migration));
  }

  return {
    requiredReaderLevel,
    unknownMigrationIds: storedReaderLevel === null ? unknownMigrationIds : [],
  };
}

export function assertDatabaseReaderCompatible(
  appliedMigrationIds: Iterable<string>,
  storedReaderLevel: number | null,
) {
  const compatibility = databaseReaderCompatibility(appliedMigrationIds, storedReaderLevel);
  if (compatibility.unknownMigrationIds.length > 0) {
    throw new DatabaseTooNewError({
      requiredReaderLevel: SUPPORTED_DATABASE_READER_LEVEL + 1,
      supportedReaderLevel: SUPPORTED_DATABASE_READER_LEVEL,
      unknownMigrationIds: compatibility.unknownMigrationIds,
    });
  }

  if (compatibility.requiredReaderLevel > SUPPORTED_DATABASE_READER_LEVEL) {
    throw new DatabaseTooNewError({
      requiredReaderLevel: compatibility.requiredReaderLevel,
      supportedReaderLevel: SUPPORTED_DATABASE_READER_LEVEL,
    });
  }

  return compatibility.requiredReaderLevel;
}

function databaseTableExists(database: SQLiteDatabase.Database, name: string) {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
  return Boolean(row);
}
