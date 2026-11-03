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
  const executor: ReadingMemorySqliteExecutor = {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
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
