import { describe, expect, it } from 'vitest';

import {
  assertDatabaseReaderCompatible,
  databaseReaderCompatibility,
  DatabaseTooNewError,
  migrationReaderLevel,
  SUPPORTED_DATABASE_READER_LEVEL,
} from './compatibility';
import { migrations } from './migrations';

describe('database reader compatibility', () => {
  it('allows future additive migrations when the stored reader level is compatible', () => {
    expect(databaseReaderCompatibility(['0099_future_additive'], 1)).toEqual({
      requiredReaderLevel: 1,
      unknownMigrationIds: [],
    });
  });

  it('blocks unknown migrations when older metadata is unavailable', () => {
    expect(() => assertDatabaseReaderCompatible(['0099_future_unknown'], null)).toThrow(
      DatabaseTooNewError,
    );
    try {
      assertDatabaseReaderCompatible(['0099_future_unknown'], null);
    } catch (error) {
      expect(error).toMatchObject({
        code: 'DATABASE_TOO_NEW',
        requiredReaderLevel: SUPPORTED_DATABASE_READER_LEVEL + 1,
        supportedReaderLevel: SUPPORTED_DATABASE_READER_LEVEL,
        unknownMigrationIds: ['0099_future_unknown'],
      });
    }
  });

  it('requires destructive migrations to declare a higher reader level', () => {
    const destructiveMigrations = migrations.filter((migration) =>
      /\bDROP\s+COLUMN\b/i.test(migration.sql),
    );

    expect(destructiveMigrations.length).toBeGreaterThan(0);
    for (const migration of destructiveMigrations) {
      expect(migrationReaderLevel(migration)).toBeGreaterThan(1);
    }
  });
});
