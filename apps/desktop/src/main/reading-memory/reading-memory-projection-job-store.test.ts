import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  completeReadingMemoryProjectionJob,
  deferFailedReadingMemoryProjectionJob,
  queueReadingMemoryProjectionJob,
  readDueReadingMemoryProjectionJobs,
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
    expect(readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:03:00.000Z', 0)).toEqual([]);
  });

  it('reads only due jobs and preserves the diagnostic shape', () => {
    const database = createDatabase();
    const job = projectionJob();
    queueReadingMemoryProjectionJob(database, job);
    deferFailedReadingMemoryProjectionJob(database, job, {
      availableAt: '2026-08-29T00:05:00.000Z',
      failedAt: '2026-08-29T00:02:00.000Z',
    });

    expect(readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:04:59.999Z', 10)).toEqual(
      [],
    );
    expect(readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:05:00.000Z', 10)).toEqual([
      {
        ...job,
        attemptCount: 1,
        availableAt: '2026-08-29T00:05:00.000Z',
        lastErrorAt: '2026-08-29T00:02:00.000Z',
      },
    ]);
    expect(readReadingMemoryProjectionJobs(database, 10)).toEqual([job]);
  });

  it('keeps unchanged backoff and resets it for a new intent', () => {
    const database = createDatabase();
    const original = projectionJob();
    queueReadingMemoryProjectionJob(database, original);
    deferFailedReadingMemoryProjectionJob(database, original, {
      availableAt: '2026-08-29T00:10:00.000Z',
      failedAt: '2026-08-29T00:02:00.000Z',
    });
    queueReadingMemoryProjectionJob(
      database,
      projectionJob({ queuedAt: '2026-08-29T00:03:00.000Z' }),
    );

    expect(readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:03:00.000Z', 10)).toEqual(
      [],
    );
    expect(readReadingMemoryProjectionJobs(database, 10)).toEqual([original]);

    const replacement = projectionJob({
      sourceVersion: 'version_2',
      queuedAt: '2026-08-29T00:03:00.000Z',
    });
    queueReadingMemoryProjectionJob(database, replacement);
    expect(readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:03:00.000Z', 10)).toEqual([
      {
        ...replacement,
        attemptCount: 0,
        availableAt: replacement.queuedAt,
        lastErrorAt: null,
      },
    ]);
  });

  it('defers by source version and saturates the attempt count', () => {
    const database = createDatabase();
    const original = projectionJob();
    const replacement = projectionJob({
      sourceVersion: 'version_2',
      queuedAt: '2026-08-29T00:02:00.000Z',
    });
    queueReadingMemoryProjectionJob(database, original);
    queueReadingMemoryProjectionJob(database, replacement);
    deferFailedReadingMemoryProjectionJob(database, original, {
      availableAt: '2026-08-29T00:10:00.000Z',
      failedAt: '2026-08-29T00:03:00.000Z',
    });
    expect(readDueReadingMemoryProjectionJobs(database, replacement.queuedAt, 10)[0]).toMatchObject(
      {
        sourceVersion: 'version_2',
        attemptCount: 0,
        availableAt: replacement.queuedAt,
        lastErrorAt: null,
      },
    );

    database
      .prepare(
        `
UPDATE reading_memory_projection_jobs
SET attempt_count = 2147483647
WHERE target_type = 'annotation_thread' AND target_id = 'annotation_1'
`,
      )
      .run();
    deferFailedReadingMemoryProjectionJob(database, replacement, {
      availableAt: '2026-08-29T00:11:00.000Z',
      failedAt: '2026-08-29T00:04:00.000Z',
    });
    expect(
      readDueReadingMemoryProjectionJobs(database, '2026-08-29T00:11:00.000Z', 10)[0],
    ).toMatchObject({
      attemptCount: 2_147_483_647,
      availableAt: '2026-08-29T00:11:00.000Z',
      lastErrorAt: '2026-08-29T00:04:00.000Z',
    });
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
  for (const id of [
    '0001_initial',
    '0067_reading_memory_projection_jobs',
    '0068_reading_memory_evidence',
  ]) {
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
