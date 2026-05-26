import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ReadingMemoryEntry } from '@yomitomo/shared';
import { migrations } from './db/migrations';
import {
  appendReadingMemoryEntries,
  deleteReadingMemoryForArticle,
  readReadingMemoryEntries,
  rebuildReadingMemoryFts,
  searchReadingMemoryEntries,
  softDeleteReadingMemoryEntriesBySource,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

describe('reading memory store', () => {
  it('appends entries and keeps FTS queryable', () => {
    const database = memoryDatabase();
    insertProjection(database);
    appendReadingMemoryEntries(
      [
        entry({
          id: 'entry_1',
          payload: { summary: 'memory topic', keyTerms: ['memory'] },
        }),
      ],
      database,
    );

    expect(readReadingMemoryEntries({ articleId: 'article_1', executor: database })).toHaveLength(
      1,
    );
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'memory',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['entry_1']);
  });

  it('soft-deletes source entries and removes their FTS rows', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        entry({
          id: 'annotation_trace',
          kind: 'trace',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: {
            items: [
              {
                type: 'agent_observation',
                content: 'annotation memory',
                evidenceAnchors: [],
                confidence: 'medium',
                createdFromTask: 'chapter_segment_annotation',
              },
            ],
          },
        }),
        entry({
          id: 'original_summary',
          sourceType: 'original_text',
          payload: { summary: 'source summary memory', keyTerms: ['source'] },
        }),
      ],
      database,
    );

    const deleted = softDeleteReadingMemoryEntriesBySource({
      articleId: 'article_1',
      sourceAnnotationId: 'annotation_1',
      deletionReason: 'annotation_deleted',
      deletedAt: '2026-05-26T01:00:00.000Z',
      executor: database,
    });

    expect(deleted).toBe(1);
    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (item) => item.id,
      ),
    ).toEqual(['original_summary']);
    expect(
      readReadingMemoryEntries({
        articleId: 'article_1',
        includeDeleted: true,
        executor: database,
      }).find((item) => item.id === 'annotation_trace')?.deletedAt,
    ).toBe('2026-05-26T01:00:00.000Z');
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'annotation',
        executor: database,
      }),
    ).toEqual([]);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'source',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['original_summary']);
  });

  it('rebuilds FTS from active entries', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        entry({
          id: 'entry_1',
          payload: { summary: 'rebuildable memory', keyTerms: ['rebuildable'] },
        }),
      ],
      database,
    );
    database.prepare('DELETE FROM reading_memory_entry_fts').run();

    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'rebuildable',
        executor: database,
      }),
    ).toEqual([]);

    rebuildReadingMemoryFts('article_1', database);

    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'rebuildable',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['entry_1']);
  });

  it('cleans entries, projections, and FTS rows for an article', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        entry({
          id: 'entry_1',
          payload: { summary: 'orphan candidate', keyTerms: ['orphan'] },
        }),
      ],
      database,
    );
    insertProjection(database);

    deleteReadingMemoryForArticle('article_1', database);

    expect(countRows(database, 'reading_memory_entries')).toBe(0);
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'orphan',
        executor: database,
      }),
    ).toEqual([]);
  });
});

function memoryDatabase(): ReadingMemorySqliteExecutor {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  const initial = migrations.find((migration) => migration.id === '0001_initial');
  const readingMemory = migrations.find((migration) => migration.id === '0035_reading_memory_tape');
  if (!initial || !readingMemory) throw new Error('missing migrations for test');
  database.exec(initial.sql);
  database.exec(readingMemory.sql);
  insertArticle(database, 'article_1');
  return database as unknown as ReadingMemorySqliteExecutor;
}

function entry(overrides: Partial<ReadingMemoryEntry> = {}): ReadingMemoryEntry {
  return {
    id: 'entry_1',
    articleId: 'article_1',
    kind: 'summary',
    scope: 'segment',
    visibility: 'default',
    payloadVersion: 1,
    chapterId: 'chapter_1',
    segmentId: 'segment_1',
    textRange: { textStart: 0, textEnd: 100 },
    sourceType: 'ai_task',
    sourceTaskId: 'task_1',
    sourceEntryIds: [],
    payload: {
      summary: 'memory topic',
      keyTerms: ['memory'],
    },
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function insertArticle(database: ReadingMemorySqliteExecutor, id: string) {
  database
    .prepare(
      `
INSERT INTO articles (
  id,
  url,
  canonical_url,
  title,
  content_hash,
  created_at,
  updated_at
)
VALUES (?, 'https://example.com/book', 'https://example.com/book', 'Book', 'hash', ?, ?)
`,
    )
    .run(id, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
}

function insertProjection(database: ReadingMemorySqliteExecutor) {
  database
    .prepare(
      `
INSERT INTO reading_memory_projections (
  id,
  article_id,
  view_type,
  view_key,
  payload,
  source_entry_ids,
  updated_at
)
VALUES ('projection_1', 'article_1', 'legacy', 'article_1', '{}', '["entry_1"]', ?)
`,
    )
    .run('2026-05-26T00:00:00.000Z');
}

function countRows(database: ReadingMemorySqliteExecutor, table: string) {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number;
  };
  return row.count;
}
