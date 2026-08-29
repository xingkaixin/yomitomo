import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  completeReadingMemoryProjectionJob,
  queueReadingMemoryProjectionJob,
  readReadingMemoryProjectionJobs,
  type ReadingMemoryProjectionJob,
} from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

describe('reading memory projection job store', () => {
  it('replaces a target with its latest projection intent', () => {
    const database = createDatabase();
    queueReadingMemoryProjectionJob(database, projectionJob());
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({
        articleId: 'article_2',
        sourceVersion: 'version_2',
        operation: 'delete',
        queuedAt: '2026-08-29T00:02:00.000Z',
      }),
    );

    expect(readReadingMemoryProjectionJobs(database, 10)).toEqual([
      projectionJob({
        articleId: 'article_2',
        sourceVersion: 'version_2',
        operation: 'delete',
        queuedAt: '2026-08-29T00:02:00.000Z',
      }),
    ]);
  });

  it('preserves queue position when the final intent is unchanged', () => {
    const database = createDatabase();
    queueReadingMemoryProjectionJob(database, projectionJob());
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({ queuedAt: '2026-08-29T00:02:00.000Z' }),
    );

    expect(readReadingMemoryProjectionJobs(database, 10)).toEqual([projectionJob()]);
  });

  it('reads a limited batch in a stable order', () => {
    const database = createDatabase();
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({ targetId: 'annotation_c', queuedAt: '2026-08-29T00:02:00.000Z' }),
    );
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({ targetId: 'annotation_b', queuedAt: '2026-08-29T00:01:00.000Z' }),
    );
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({ targetId: 'annotation_a', queuedAt: '2026-08-29T00:01:00.000Z' }),
    );

    expect(readReadingMemoryProjectionJobs(database, 2).map((job) => job.targetId)).toEqual([
      'annotation_a',
      'annotation_b',
    ]);
    expect(readReadingMemoryProjectionJobs(database, 0)).toEqual([]);
    expect(readReadingMemoryProjectionJobs(database, 1.5)).toEqual([]);
    expect(readReadingMemoryProjectionJobs(database, Number.MAX_SAFE_INTEGER + 1)).toEqual([]);
  });

  it('does not let an old processor complete a newer task', () => {
    const database = createDatabase();
    queueReadingMemoryProjectionJob(database, projectionJob());
    const [oldJob] = readReadingMemoryProjectionJobs(database, 1);
    if (!oldJob) throw new Error('missing queued projection job');

    const currentJob = projectionJob({
      sourceVersion: 'version_2',
      operation: 'delete',
      queuedAt: '2026-08-29T00:02:00.000Z',
    });
    queueReadingMemoryProjectionJob(database, currentJob);
    completeReadingMemoryProjectionJob(database, oldJob);
    expect(readReadingMemoryProjectionJobs(database, 1)).toEqual([currentJob]);

    completeReadingMemoryProjectionJob(database, currentJob);
    expect(readReadingMemoryProjectionJobs(database, 1)).toEqual([]);
  });

  it('participates in the caller transaction', () => {
    const database = createDatabase();
    database.exec('BEGIN');
    queueReadingMemoryProjectionJob(database, projectionJob());
    database.exec('ROLLBACK');

    expect(readReadingMemoryProjectionJobs(database, 1)).toEqual([]);
  });
});

function createDatabase(): ReadingMemorySqliteExecutor {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const id of ['0001_initial', '0067_reading_memory_projection_jobs']) {
    const migration = migrations.find((item) => item.id === id);
    if (!migration) throw new Error(`missing migration ${id}`);
    sqlite.exec(migration.sql);
  }
  sqlite.exec(`
INSERT INTO articles (
  id, url, canonical_url, title, content_hash, created_at, updated_at
) VALUES
  (
    'article_1', 'https://example.com/1', 'https://example.com/1', 'Article 1', 'hash_1',
    '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
  ),
  (
    'article_2', 'https://example.com/2', 'https://example.com/2', 'Article 2', 'hash_2',
    '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
  );
`);
  return {
    exec: (sql) => sqlite.exec(sql),
    prepare: (sql) => {
      const statement = sqlite.prepare(sql);
      return {
        all: (...values) => statement.all(...values),
        get: (...values) => statement.get(...values),
        run: (...values) => statement.run(...values),
      };
    },
  };
}

function projectionJob(
  overrides: Partial<ReadingMemoryProjectionJob> = {},
): ReadingMemoryProjectionJob {
  return {
    targetType: 'annotation_thread',
    targetId: 'annotation_1',
    articleId: 'article_1',
    sourceVersion: 'version_1',
    operation: 'upsert',
    queuedAt: '2026-08-29T00:01:00.000Z',
    ...overrides,
  };
}
