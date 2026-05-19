import { describe, expect, it } from 'vitest';

import {
  assertDatabaseReaderCompatible,
  databaseReaderCompatibility,
  migrationReaderLevel,
} from './compatibility';
import { migrations } from './migrations';

describe('database reader compatibility', () => {
  it('keeps additive migrations compatible with older readers', () => {
    expect(databaseReaderCompatibility(['0025_annotation_generation_fields'], null)).toEqual({
      requiredReaderLevel: 1,
      unknownMigrationIds: [],
    });
  });

  it('marks credential migration as requiring the newer reader level', () => {
    const migration = migrations.find((item) => item.id === '0026_provider_api_key_ref');

    expect(migration && migrationReaderLevel(migration)).toBe(2);
    expect(databaseReaderCompatibility(['0026_provider_api_key_ref'], null)).toEqual({
      requiredReaderLevel: 2,
      unknownMigrationIds: [],
    });
  });

  it('allows future additive migrations when the stored reader level is compatible', () => {
    expect(databaseReaderCompatibility(['0099_future_additive'], 1)).toEqual({
      requiredReaderLevel: 1,
      unknownMigrationIds: [],
    });
  });

  it('blocks unknown migrations when older metadata is unavailable', () => {
    expect(() => assertDatabaseReaderCompatible(['0099_future_unknown'], null)).toThrow(
      /reader level 3/,
    );
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
