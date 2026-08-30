import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  readingMemoryEvidenceProjectorVersion,
  runReadingMemoryEvidenceProjectionBatch,
} from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import {
  queueReadingMemoryProjectionJob,
  readReadingMemoryProjectionJobs,
} from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const now = new Date('2026-08-29T00:00:00.000Z');

describe('reading memory evidence projection batch', () => {
  it('backfills many sources with a fixed number of source reads', () => {
    const fixture = createFixture();
    for (let index = 0; index < 8; index += 1) {
      fixture.insertThread(`annotation_${index}`);
    }
    fixture.resetQueries();

    const result = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 20,
      backfillLimit: 20,
    });

    expect(result).toMatchObject({
      selectedJobCount: 8,
      completedJobCount: 8,
      refreshedJobCount: 0,
      queuedBackfillCount: 8,
      failures: [],
      hasImmediateWork: false,
    });
    expect(fixture.rows('reading_memory_evidence_receipts')).toHaveLength(8);
    expect(fixture.rows('reading_memory_evidence_entries')).toHaveLength(8);
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([]);
    expect(fixture.sourceSelects()).toHaveLength(6);
    expect(
      fixture.sourceSelects().filter((sql) => sql.includes('reading_memory_reviews')),
    ).toHaveLength(2);
  });

  it('refreshes stale work before projecting the current source', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_1');
    const source = fixture.source('annotation_1');
    queueReadingMemoryProjectionJob(fixture.executor, {
      targetType: 'annotation_thread',
      targetId: 'annotation_1',
      articleId: 'article_1',
      sourceVersion: 'stale-source-version',
      operation: 'upsert',
      queuedAt: now.toISOString(),
    });

    const refresh = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(refresh).toMatchObject({
      selectedJobCount: 1,
      completedJobCount: 0,
      refreshedJobCount: 1,
      hasImmediateWork: true,
    });
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([]);
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual([
      expect.objectContaining({
        targetId: 'annotation_1',
        sourceVersion: source.sourceVersion,
        operation: 'upsert',
      }),
    ]);

    const projected = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(projected).toMatchObject({ completedJobCount: 1, refreshedJobCount: 0 });
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([]);
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({ source_version: source.sourceVersion }),
    ]);
  });

  it('turns an obsolete upsert into a durable delete intent', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_1');
    const source = fixture.source('annotation_1');
    queueReadingMemoryProjectionJob(fixture.executor, {
      targetType: 'annotation_thread',
      targetId: 'annotation_1',
      articleId: 'article_1',
      sourceVersion: source.sourceVersion,
      operation: 'upsert',
      queuedAt: now.toISOString(),
    });
    fixture.deleteThread('annotation_1');

    const refresh = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(refresh).toMatchObject({ completedJobCount: 0, refreshedJobCount: 1 });
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual([
      expect.objectContaining({ targetId: 'annotation_1', operation: 'delete' }),
    ]);

    const deletion = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(deletion).toMatchObject({ completedJobCount: 1, refreshedJobCount: 0 });
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([]);
  });

  it('preserves a recreated source by replacing its delete intent', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_1');
    queueReadingMemoryProjectionJob(fixture.executor, {
      targetType: 'annotation_thread',
      targetId: 'annotation_1',
      articleId: 'article_1',
      sourceVersion: 'deleted-source-version',
      operation: 'delete',
      queuedAt: now.toISOString(),
    });

    const result = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(result).toMatchObject({ completedJobCount: 0, refreshedJobCount: 1 });
    expect(readReadingMemoryProjectionJobs(fixture.executor, 10)).toEqual([
      expect.objectContaining({ targetId: 'annotation_1', operation: 'upsert' }),
    ]);
  });

  it('rolls back one failed source, defers it, and continues the batch', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_fail');
    fixture.insertThread('annotation_ok');
    fixture.queueCurrentSources(['annotation_fail', 'annotation_ok']);
    fixture.failEvidenceInsertFor('annotation_fail');

    const result = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(result).toMatchObject({
      selectedJobCount: 2,
      completedJobCount: 1,
      refreshedJobCount: 0,
      failures: [
        {
          job: expect.objectContaining({ targetId: 'annotation_fail' }),
          retryAt: '2026-08-29T00:00:05.000Z',
        },
      ],
    });
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({ target_id: 'annotation_ok' }),
    ]);
    expect(fixture.rows('reading_memory_evidence_entries')).toEqual([
      expect.objectContaining({ target_id: 'annotation_ok' }),
    ]);
    expect(fixture.rows('reading_memory_projection_jobs')).toEqual([
      expect.objectContaining({
        target_id: 'annotation_fail',
        attempt_count: 1,
        available_at: '2026-08-29T00:00:05.000Z',
        last_error_at: now.toISOString(),
      }),
    ]);
  });

  it('rebuilds receipts when the projector version changes', () => {
    const fixture = createFixture();
    fixture.insertThread('annotation_1');
    fixture.insertReceipt('annotation_1', 'reading-memory-evidence:v0');

    const result = runReadingMemoryEvidenceProjectionBatch(fixture.executor, {
      now,
      jobLimit: 10,
      backfillLimit: 10,
    });

    expect(result.queuedBackfillCount).toBe(1);
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({
        target_id: 'annotation_1',
        projector_version: readingMemoryEvidenceProjectorVersion,
      }),
    ]);
  });
});

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  database.exec(`
INSERT INTO articles (
  id, url, canonical_url, title, content_hash, created_at, updated_at
) VALUES (
  'article_1', 'https://example.com/1', 'https://example.com/1', 'Article 1', 'hash_1',
  '2026-08-29T00:00:00.000Z', '2026-08-29T00:00:00.000Z'
);
`);
  const preparedSql: string[] = [];
  const executor: ReadingMemorySqliteExecutor = {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      preparedSql.push(sql);
      const statement = database.prepare(sql);
      return {
        all: (...values) => statement.all(...values),
        get: (...values) => statement.get(...values),
        run: (...values) => statement.run(...values),
      };
    },
  };
  const insertThread = (annotationId: string) =>
    database
      .prepare(
        `
INSERT INTO annotations (
  id, article_id, anchor, author, color, user_id, user_username, created_at, updated_at
) VALUES (?, 'article_1', ?, 'user', '#f59e0b', 'reader_1', 'reader', ?, ?)
`,
      )
      .run(
        annotationId,
        JSON.stringify({
          exact: `Evidence ${annotationId}`,
          prefix: 'Before',
          suffix: 'After',
          start: 1,
          end: 10,
        }),
        '2026-08-29T00:00:00.000Z',
        '2026-08-29T00:00:00.000Z',
      );
  const source = (annotationId: string) => {
    const [result] = readStoredAnnotationThreadSources(executor, [annotationId]);
    if (!result) throw new Error(`Missing source ${annotationId}`);
    return result;
  };
  return {
    executor,
    rows: (table: string) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    insertThread,
    source,
    deleteThread: (annotationId: string) =>
      database.prepare('DELETE FROM annotations WHERE id = ?').run(annotationId),
    resetQueries: () => preparedSql.splice(0),
    sourceSelects: () =>
      preparedSql.filter(
        (sql) =>
          (sql.includes('FROM annotations AS annotation') && !sql.includes('LEFT JOIN')) ||
          sql.includes('FROM comments AS comment'),
      ),
    queueCurrentSources: (annotationIds: string[]) => {
      for (const current of readStoredAnnotationThreadSources(executor, annotationIds)) {
        queueReadingMemoryProjectionJob(executor, {
          targetType: 'annotation_thread',
          targetId: current.targetId,
          articleId: current.articleId,
          sourceVersion: current.sourceVersion,
          operation: 'upsert',
          queuedAt: now.toISOString(),
        });
      }
    },
    failEvidenceInsertFor: (annotationId: string) =>
      database.exec(`
CREATE TRIGGER fail_evidence_insert
BEFORE INSERT ON reading_memory_evidence_entries
WHEN NEW.target_id = '${annotationId}'
BEGIN
  SELECT RAISE(ABORT, 'injected evidence failure');
END;
`),
    insertReceipt: (annotationId: string, projectorVersion: string) =>
      database
        .prepare(
          `
INSERT INTO reading_memory_evidence_receipts (
  target_type, target_id, article_id, source_version, projector_version, projected_at
) VALUES ('annotation_thread', ?, 'article_1', 'old-source', ?, ?)
`,
        )
        .run(annotationId, projectorVersion, now.toISOString()),
  };
}
