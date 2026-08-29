import SQLiteDatabase from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import {
  deleteOrphanedReadingEvidenceReceipts,
  deleteReadingEvidenceThreadInTransaction,
  readReadingEvidenceBackfillTargetIds,
  replaceReadingEvidenceThreadInTransaction,
} from './reading-memory-evidence-store';
import { queueReadingMemoryProjectionJob } from './reading-memory-projection-job-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import { withReadingMemoryTransaction } from './reading-memory-store';

const projectorVersion = 'reading-memory-evidence:v1';

describe('reading memory evidence store', () => {
  it('atomically replaces a thread receipt, entries, and synchronized FTS rows', () => {
    const fixture = createFixture();
    withReadingMemoryTransaction(fixture.executor, () => {
      replaceReadingEvidenceThreadInTransaction(
        fixture.executor,
        receipt('annotation_1', 'source_1'),
        [entry('annotation', 'source_1', '选择压力与认知偏差')],
      );
    });
    expect(fixture.ftsEntryIds('选择压')).toEqual(['reading_evidence_annotation:annotation_1']);

    withReadingMemoryTransaction(fixture.executor, () => {
      replaceReadingEvidenceThreadInTransaction(
        fixture.executor,
        receipt('annotation_1', 'source_2'),
        [entry('distillation', 'source_2', '重新审视旧判断')],
      );
    });

    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({
        target_id: 'annotation_1',
        source_version: 'source_2',
        projector_version: projectorVersion,
      }),
    ]);
    expect(fixture.rows('reading_memory_evidence_entries')).toEqual([
      expect.objectContaining({
        id: 'reading_evidence_distillation:annotation_1',
        source_version: 'source_2',
      }),
    ]);
    expect(fixture.ftsEntryIds('选择压')).toEqual([]);
    expect(fixture.ftsEntryIds('重新审')).toEqual(['reading_evidence_distillation:annotation_1']);
  });

  it('records a completed source even when it produces no entries', () => {
    const fixture = createFixture();

    withReadingMemoryTransaction(fixture.executor, () => {
      replaceReadingEvidenceThreadInTransaction(
        fixture.executor,
        receipt('annotation_1', 'source_1'),
        [],
      );
    });

    expect(fixture.rows('reading_memory_evidence_receipts')).toHaveLength(1);
    expect(fixture.rows('reading_memory_evidence_entries')).toEqual([]);
  });

  it('derives backfill gaps and excludes targets that already have durable work', () => {
    const fixture = createFixture();
    fixture.insertAnnotation('annotation_current');
    fixture.insertAnnotation('annotation_missing');
    fixture.insertAnnotation('annotation_pending');
    fixture.insertAnnotation('annotation_stale');
    fixture.insertReceipt('annotation_current', projectorVersion);
    fixture.insertReceipt('annotation_stale', 'reading-memory-evidence:v0');
    queueReadingMemoryProjectionJob(fixture.executor, {
      targetType: 'annotation_thread',
      targetId: 'annotation_pending',
      articleId: 'article_1',
      sourceVersion: 'pending_source',
      operation: 'upsert',
      queuedAt: '2026-08-29T00:02:00.000Z',
    });

    expect(readReadingEvidenceBackfillTargetIds(fixture.executor, projectorVersion, 10)).toEqual([
      'annotation_missing',
      'annotation_stale',
    ]);
  });

  it('clears orphan receipts and their entries in bounded batches', () => {
    const fixture = createFixture();
    fixture.insertReceipt('annotation_orphan_1', projectorVersion);
    fixture.insertReceipt('annotation_orphan_2', projectorVersion);
    fixture.insertEvidenceEntry('annotation_orphan_1', '孤立投影一');
    fixture.insertEvidenceEntry('annotation_orphan_2', '孤立投影二');

    expect(deleteOrphanedReadingEvidenceReceipts(fixture.executor, 1)).toBe(1);
    expect(fixture.rows('reading_memory_evidence_receipts')).toHaveLength(1);
    expect(fixture.rows('reading_memory_evidence_entries')).toHaveLength(1);
    expect(deleteOrphanedReadingEvidenceReceipts(fixture.executor, 10)).toBe(1);
    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([]);
    expect(fixture.rows('reading_memory_evidence_entries')).toEqual([]);
    expect(fixture.rows('reading_memory_evidence_fts')).toEqual([]);
  });

  it('deletes only the explicitly owned thread projection', () => {
    const fixture = createFixture();
    fixture.insertReceipt('annotation_1', projectorVersion);
    fixture.insertReceipt('annotation_2', projectorVersion);

    withReadingMemoryTransaction(fixture.executor, () => {
      deleteReadingEvidenceThreadInTransaction(fixture.executor, 'annotation_1');
    });

    expect(fixture.rows('reading_memory_evidence_receipts')).toEqual([
      expect.objectContaining({ target_id: 'annotation_2' }),
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
  const insertReceipt = (targetId: string, version: string) =>
    database
      .prepare(
        `
INSERT INTO reading_memory_evidence_receipts (
  target_type, target_id, article_id, source_version, projector_version, projected_at
) VALUES ('annotation_thread', ?, 'article_1', 'source_1', ?, '2026-08-29T00:01:00.000Z')
`,
      )
      .run(targetId, version);
  return {
    executor,
    rows: (table: string) => database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ftsEntryIds: (query: string) =>
      database
        .prepare(
          `
SELECT entry_id AS entryId
FROM reading_memory_evidence_fts
WHERE reading_memory_evidence_fts MATCH ?
ORDER BY entry_id ASC
`,
        )
        .all(query)
        .map((row) => (row as { entryId: string }).entryId),
    insertAnnotation: (annotationId: string) =>
      database
        .prepare(
          `
INSERT INTO annotations (
  id, article_id, anchor, author, color, created_at, updated_at
) VALUES (?, 'article_1', ?, 'user', '#f59e0b', ?, ?)
`,
        )
        .run(
          annotationId,
          JSON.stringify({ exact: annotationId, prefix: '', suffix: '', start: 0, end: 1 }),
          '2026-08-29T00:00:00.000Z',
          '2026-08-29T00:00:00.000Z',
        ),
    insertReceipt,
    insertEvidenceEntry: (targetId: string, searchText: string) =>
      database
        .prepare(
          `
INSERT INTO reading_memory_evidence_entries (
  id,
  article_id,
  target_type,
  target_id,
  asset_type,
  source_version,
  projector_version,
  is_judgment,
  is_user_authored,
  search_text,
  source_created_at,
  source_updated_at
) VALUES (?, 'article_1', 'annotation_thread', ?, 'annotation', 'source_1', ?, 0, 1, ?, ?, ?)
`,
        )
        .run(
          `reading_evidence_annotation:${targetId}`,
          targetId,
          projectorVersion,
          searchText,
          '2026-08-29T00:00:00.000Z',
          '2026-08-29T00:00:00.000Z',
        ),
  };
}

function receipt(targetId: string, sourceVersion: string) {
  return {
    targetId,
    articleId: 'article_1',
    sourceVersion,
    projectorVersion,
    projectedAt: '2026-08-29T00:02:00.000Z',
  };
}

function entry(
  assetType: 'annotation' | 'distillation',
  sourceVersion: string,
  searchText: string,
) {
  return {
    id: `reading_evidence_${assetType}:annotation_1`,
    assetType,
    sourceCommentId: undefined,
    sourceVersion,
    projectorVersion,
    isJudgment: assetType === 'distillation',
    isUserAuthored: true,
    searchText,
    sourceCreatedAt: '2026-08-29T00:00:00.000Z',
    sourceUpdatedAt: '2026-08-29T00:01:00.000Z',
  };
}
