import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ReadingMemoryEntry } from '@yomitomo/shared';
import { migrations } from '../db/migrations';
import {
  appendReadingMemoryEntries,
  deleteReadingMemoryForArticle,
  readReadingMemoryEntries,
  searchReadingMemoryEntries,
  upsertReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

describe('reading memory store', () => {
  it('sanitizes mention and punctuation queries before FTS lookup', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        entry({
          id: 'mention_entry',
          kind: 'reader_signal',
          scope: 'reader',
          sourceType: 'comment',
          sourceCommentId: 'comment_1',
          payload: {
            source: 'comment',
            author: 'user',
            content: '@林知微 选择压力',
          },
        }),
      ],
      database,
    );

    expect(() =>
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: '@林知微：选择压力？',
        executor: database,
      }),
    ).not.toThrow();
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: '@林知微：选择压力？',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['mention_entry']);
  });

  it('upserts deterministic entries and replaces stale FTS rows', () => {
    const database = memoryDatabase();
    insertProjection(database);

    upsertReadingMemoryEntries(
      [
        entry({
          id: 'annotation_memory_annotation_1',
          kind: 'reader_signal',
          scope: 'reader',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: { source: 'annotation', anchorExact: 'before topic' },
        }),
      ],
      database,
    );
    upsertReadingMemoryEntries(
      [
        entry({
          id: 'annotation_memory_annotation_1',
          kind: 'reader_signal',
          scope: 'reader',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: { source: 'annotation', anchorExact: 'after topic' },
          updatedAt: '2026-05-26T01:00:00.000Z',
        }),
      ],
      database,
    );

    const entries = readReadingMemoryEntries({ articleId: 'article_1', executor: database });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.payload).toMatchObject({ anchorExact: 'after topic' });
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'before',
        executor: database,
      }),
    ).toEqual([]);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'after',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['annotation_memory_annotation_1']);
  });

  it('filters memory entries by current and other agent ids', () => {
    const database = memoryDatabase();
    appendReadingMemoryEntries(
      [
        entry({
          id: 'own_entry',
          scope: 'agent',
          agentId: 'agent_1',
          payload: { summary: 'own memory', keyTerms: ['shared'] },
        }),
        entry({
          id: 'other_entry',
          scope: 'agent',
          agentId: 'agent_2',
          payload: { summary: 'other memory', keyTerms: ['shared'] },
        }),
        entry({
          id: 'reader_entry',
          scope: 'reader',
          payload: { summary: 'reader memory', keyTerms: ['shared'] },
        }),
      ],
      database,
    );

    expect(
      readReadingMemoryEntries({
        articleId: 'article_1',
        agentId: 'agent_1',
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['own_entry']);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'shared',
        excludeAgentId: 'agent_1',
        requireAgentId: true,
        executor: database,
      }).map((item) => item.id),
    ).toEqual(['other_entry']);
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
  return database;
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
