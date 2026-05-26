import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ReadingMemoryEntry } from '@yomitomo/shared';
import { migrations } from './db/migrations';
import {
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
} from './article-repository';
import {
  appendReadingMemoryEntries,
  readReadingMemoryEntries,
  searchReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

describe('article memory lifecycle', () => {
  it('deletes article memory entries, projections, and FTS rows with the article', () => {
    const database = lifecycleDatabase();
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'entry_1',
          payload: { summary: 'article lifecycle memory', keyTerms: ['lifecycle'] },
        }),
      ],
      database,
    );
    insertProjection(database);

    deleteArticleRowsWithMemoryLifecycle(database, 'article_1');

    expect(countRows(database, 'articles')).toBe(0);
    expect(countRows(database, 'reading_memory_entries')).toBe(0);
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'lifecycle',
        executor: database,
      }),
    ).toEqual([]);
  });

  it('soft-deletes annotation source memory without touching original summaries', () => {
    const database = lifecycleDatabase();
    insertAnnotation(database, 'annotation_1');
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'annotation_entry',
          kind: 'trace',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: { items: [traceItem('annotation source memory')] },
        }),
        memoryEntry({
          id: 'original_summary',
          sourceType: 'original_text',
          payload: { summary: 'original summary memory', keyTerms: ['original'] },
        }),
      ],
      database,
    );

    const result = deleteAnnotationRowsWithMemoryLifecycle(database, {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      deletedAt: '2026-05-26T01:00:00.000Z',
    });

    expect(result).toEqual({ deletedAnnotationCount: 1, deletedMemoryCount: 1 });
    expect(countRows(database, 'annotations')).toBe(0);
    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['original_summary']);
    expect(
      readReadingMemoryEntries({
        articleId: 'article_1',
        includeDeleted: true,
        executor: database,
      }).find((entry) => entry.id === 'annotation_entry')?.deletedAt,
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
        query: 'original',
        executor: database,
      }).map((entry) => entry.id),
    ).toEqual(['original_summary']);
  });

  it('soft-deletes comment source memory without deleting annotation memory', () => {
    const database = lifecycleDatabase();
    insertAnnotation(database, 'annotation_1');
    insertComment(database, 'annotation_1', 'comment_1');
    insertComment(database, 'annotation_1', 'reply_1', 'comment_1');
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'comment_entry',
          kind: 'trace',
          sourceType: 'comment',
          sourceCommentId: 'comment_1',
          payload: { items: [traceItem('comment source memory')] },
        }),
        memoryEntry({
          id: 'annotation_entry',
          kind: 'trace',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: { items: [traceItem('annotation source memory')] },
        }),
        memoryEntry({
          id: 'reply_entry',
          kind: 'trace',
          sourceType: 'comment',
          sourceCommentId: 'reply_1',
          payload: { items: [traceItem('reply source memory')] },
        }),
      ],
      database,
    );

    const result = deleteCommentRowsWithMemoryLifecycle(database, {
      articleId: 'article_1',
      annotationId: 'annotation_1',
      commentId: 'comment_1',
      deletedAt: '2026-05-26T01:00:00.000Z',
    });

    expect(result).toEqual({ deletedCommentCount: 2, deletedMemoryCount: 2 });
    expect(countRows(database, 'comments')).toBe(0);
    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['annotation_entry']);
  });
});

function lifecycleDatabase(): ReadingMemorySqliteExecutor {
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

function memoryEntry(overrides: Partial<ReadingMemoryEntry> = {}): ReadingMemoryEntry {
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

function traceItem(content: string) {
  return {
    type: 'agent_observation' as const,
    content,
    evidenceAnchors: [],
    confidence: 'medium' as const,
    createdFromTask: 'chapter_segment_annotation',
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

function insertAnnotation(database: ReadingMemorySqliteExecutor, id: string) {
  database
    .prepare(
      `
INSERT INTO annotations (
  id,
  article_id,
  anchor,
  author,
  color,
  created_at,
  updated_at
)
VALUES (?, 'article_1', '{}', 'user', '#f4c95d', ?, ?)
`,
    )
    .run(id, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
}

function insertComment(
  database: ReadingMemorySqliteExecutor,
  annotationId: string,
  commentId: string,
  replyTo?: string,
) {
  database
    .prepare(
      `
INSERT INTO comments (
  id,
  annotation_id,
  author,
  content,
  created_at,
  reply_to
)
VALUES (?, ?, 'user', 'comment', ?, ?)
`,
    )
    .run(commentId, annotationId, '2026-05-26T00:00:00.000Z', replyTo || null);
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
