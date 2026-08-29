import { DatabaseSync } from 'node:sqlite';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, Comment, ReadingMemoryEntry } from '@yomitomo/shared';
import { migrations } from '../db/migrations';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';

const storeDbState = vi.hoisted(() => ({
  database: null as StoreDatabase | null,
  executor: null as ReadingMemorySqliteExecutor | null,
}));

vi.mock('../store/store-db', () => ({
  getDatabase: () => {
    if (!storeDbState.database) throw new Error('test database is not configured');
    return storeDbState.database;
  },
  getSqliteExecutor: () => {
    if (!storeDbState.executor) throw new Error('test executor is not configured');
    return storeDbState.executor;
  },
}));

import {
  backfillArticleAnnotationMemoryEntries,
  syncArticleAnnotationMemoryEntries,
} from './article-annotation-memory';
import {
  deleteAnnotationRowsWithMemoryLifecycle,
  deleteArticleRowsWithMemoryLifecycle,
  deleteCommentRowsWithMemoryLifecycle,
} from './article-repository-lifecycle';
import { saveArticleRows } from './article-row-writes';
import {
  appendReadingMemoryEntries,
  readReadingMemoryEntries,
  searchReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import { readReadingMemoryProjectionJobs } from '../reading-memory/reading-memory-projection-job-store';

describe('article memory lifecycle', () => {
  afterEach(() => {
    storeDbState.database = null;
    storeDbState.executor = null;
  });

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

  it('deletes article collection memberships and pins with the article', () => {
    const database = lifecycleDatabase();
    insertCollectionReferences(database, 'article_1');

    deleteArticleRowsWithMemoryLifecycle(database, 'article_1');

    expect(countRows(database, 'collection_members')).toBe(0);
    expect(countRows(database, 'library_pins')).toBe(0);
  });

  it('queues source cleanup in the article deletion transaction', () => {
    const database = lifecycleDatabase();
    database.prepare("UPDATE articles SET source_type = 'pdf' WHERE id = ?").run('article_1');

    deleteArticleRowsWithMemoryLifecycle(database, 'article_1');

    expect(countRows(database, 'article_source_cleanup_tasks')).toBe(1);
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
    expect(readReadingMemoryProjectionJobs(database, 1)[0]).toMatchObject({
      targetId: 'annotation_1',
      articleId: 'article_1',
      operation: 'delete',
    });
  });

  it('soft-deletes comment source memory without deleting annotation memory', () => {
    const database = lifecycleDatabase();
    insertAnnotation(database, 'annotation_1');
    insertComment(database, 'annotation_1', 'comment_1');
    insertComment(database, 'annotation_1', 'reply_1', 'comment_1');
    insertComment(database, 'annotation_1', 'reply_2', 'reply_1');
    insertComment(database, 'annotation_1', 'sibling_1');
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
        memoryEntry({
          id: 'nested_reply_entry',
          kind: 'trace',
          sourceType: 'comment',
          sourceCommentId: 'reply_2',
          payload: { items: [traceItem('nested reply source memory')] },
        }),
        memoryEntry({
          id: 'sibling_entry',
          kind: 'trace',
          sourceType: 'comment',
          sourceCommentId: 'sibling_1',
          payload: { items: [traceItem('sibling source memory')] },
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

    expect(result).toEqual({ deletedCommentCount: 3, deletedMemoryCount: 3 });
    expect(commentIds(database)).toEqual(['sibling_1']);
    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['annotation_entry', 'sibling_entry']);
    expect(readReadingMemoryProjectionJobs(database, 1)[0]).toMatchObject({
      targetId: 'annotation_1',
      articleId: 'article_1',
      operation: 'upsert',
    });
  });

  it('syncs annotation and comment memory entries from the main store model', () => {
    const database = lifecycleDatabase();

    syncArticleAnnotationMemoryEntries(
      {
        id: 'article_1',
        annotations: [
          annotation({
            id: 'annotation_1',
            author: { kind: 'user', username: 'reader' },
            comments: [
              {
                id: 'comment_1',
                author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
                content: 'assistant thread memory',
                createdAt: '2026-05-26T00:10:00.000Z',
              },
            ],
          }),
        ],
      },
      database,
    );

    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        sourceAnnotationId: entry.sourceAnnotationId,
        sourceCommentId: entry.sourceCommentId,
      })),
    ).toEqual([
      {
        id: 'annotation_memory_annotation_1',
        kind: 'reader_signal',
        sourceAnnotationId: 'annotation_1',
        sourceCommentId: undefined,
      },
      {
        id: 'comment_memory_comment_1',
        kind: 'trace',
        sourceAnnotationId: 'annotation_1',
        sourceCommentId: 'comment_1',
      },
    ]);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'assistant',
        executor: database,
      }).map((entry) => entry.id),
    ).toEqual(['comment_memory_comment_1']);
    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).find(
        (entry) => entry.id === 'comment_memory_comment_1',
      )?.payload,
    ).toMatchObject({
      content: 'assistant thread memory',
    });
  });

  it('soft-deletes removed annotation memory during full article saves', async () => {
    const database = articleRowsDatabase();
    const removedAnnotation = annotation({
      id: 'annotation_removed',
      comments: [
        annotationComment({
          id: 'comment_removed',
          content: 'removed annotation comment memory',
        }),
      ],
    });

    await saveArticleRows(articleRecord({ annotations: [removedAnnotation] }));
    insertProjection(database);

    await saveArticleRows(
      articleRecord({
        annotations: [],
        updatedAt: '2026-05-26T01:00:00.000Z',
      }),
    );

    const activeMemoryIds = readReadingMemoryEntries({
      articleId: 'article_1',
      executor: database,
    }).map((entry) => entry.id);
    expect(activeMemoryIds).toEqual([]);
    expect(countRows(database, 'reading_memory_projections')).toBe(0);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'removed',
        executor: database,
      }),
    ).toEqual([]);
    expect(
      readReadingMemoryEntries({
        articleId: 'article_1',
        includeDeleted: true,
        executor: database,
      })
        .filter((entry) => entry.deletedAt)
        .map((entry) => ({
          id: entry.id,
          deletionReason: entry.deletionReason,
        })),
    ).toEqual([
      {
        id: 'annotation_memory_annotation_removed',
        deletionReason: 'annotation_deleted',
      },
      {
        id: 'comment_memory_comment_removed',
        deletionReason: 'annotation_deleted',
      },
    ]);
    expect(readReadingMemoryProjectionJobs(database, 1)[0]).toMatchObject({
      targetId: 'annotation_removed',
      articleId: 'article_1',
      operation: 'delete',
    });
  });

  it('soft-deletes removed comment memory during full article saves', async () => {
    const database = articleRowsDatabase();
    const retainedComment = annotationComment({
      id: 'comment_retained',
      content: 'retained comment memory',
    });
    const removedComment = annotationComment({
      id: 'comment_removed',
      content: 'removed comment memory',
    });

    await saveArticleRows(
      articleRecord({
        annotations: [
          annotation({
            id: 'annotation_1',
            comments: [retainedComment, removedComment],
          }),
        ],
      }),
    );

    await saveArticleRows(
      articleRecord({
        annotations: [
          annotation({
            id: 'annotation_1',
            comments: [retainedComment],
          }),
        ],
        updatedAt: '2026-05-26T01:00:00.000Z',
      }),
    );

    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['annotation_memory_annotation_1', 'comment_memory_comment_retained']);
    expect(
      searchReadingMemoryEntries({
        articleId: 'article_1',
        query: 'removed',
        executor: database,
      }),
    ).toEqual([]);
    expect(
      readReadingMemoryEntries({
        articleId: 'article_1',
        includeDeleted: true,
        executor: database,
      })
        .filter((entry) => entry.deletedAt)
        .map((entry) => ({
          id: entry.id,
          deletionReason: entry.deletionReason,
        })),
    ).toEqual([
      {
        id: 'comment_memory_comment_removed',
        deletionReason: 'comment_deleted',
      },
    ]);
    expect(readReadingMemoryProjectionJobs(database, 1)[0]).toMatchObject({
      targetId: 'annotation_1',
      articleId: 'article_1',
      operation: 'upsert',
    });
  });

  it('rolls the article write and its memory soft-deletes back together', async () => {
    const database = articleRowsDatabase();
    await saveArticleRows(
      articleRecord({
        annotations: [
          annotation({
            id: 'annotation_rolled_back',
            comments: [annotationComment({ id: 'comment_rolled_back', content: 'memory' })],
          }),
        ],
      }),
    );
    insertProjection(database);
    const memoryBefore = readReadingMemoryEntries({ articleId: 'article_1', executor: database });
    const projectionJobsBefore = readReadingMemoryProjectionJobs(database, 10);
    database.exec(`
      CREATE TRIGGER fail_annotation_insert
      BEFORE INSERT ON annotations
      BEGIN SELECT RAISE(ABORT, 'annotation insert failed'); END;
    `);

    await expect(
      saveArticleRows(
        articleRecord({
          annotations: [annotation({ id: 'annotation_new' })],
          updatedAt: '2026-05-26T02:00:00.000Z',
        }),
      ),
    ).rejects.toThrow('annotation insert failed');

    expect(readReadingMemoryEntries({ articleId: 'article_1', executor: database })).toEqual(
      memoryBefore,
    );
    expect(articleAnnotationIds(database, 'article_1')).toEqual(['annotation_rolled_back']);
    expect(readReadingMemoryProjectionJobs(database, 10)).toEqual(projectionJobsBefore);
  });

  it('keeps a saved article when only the memory mirror fails', async () => {
    const database = articleRowsDatabase();
    database.exec(`
      CREATE TRIGGER fail_memory_entry_insert
      BEFORE INSERT ON reading_memory_entries
      BEGIN SELECT RAISE(ABORT, 'memory mirror failed'); END;
    `);

    const patch = await saveArticleRows(
      articleRecord({ annotations: [annotation({ id: 'annotation_mirror' })] }),
    );

    // The mirror runs after the article transaction and swallows its own failure, so the
    // article survives while its memory projection is missing.
    expect(patch.article.id).toBe('article_1');
    expect(articleAnnotationIds(database, 'article_1')).toEqual(['annotation_mirror']);
    expect(readReadingMemoryEntries({ articleId: 'article_1', executor: database })).toEqual([]);
    expect(readReadingMemoryProjectionJobs(database, 1)[0]).toMatchObject({
      targetId: 'annotation_mirror',
      articleId: 'article_1',
      operation: 'upsert',
    });
  });

  it('rolls annotation deletion back with its memory soft-delete', () => {
    const database = lifecycleDatabase();
    insertAnnotation(database, 'annotation_1');
    appendReadingMemoryEntries(
      [
        memoryEntry({
          id: 'memory_annotation',
          kind: 'trace',
          sourceType: 'annotation',
          sourceAnnotationId: 'annotation_1',
          payload: { items: [traceItem('annotation source memory')] },
        }),
      ],
      database,
    );
    database.exec(`
      CREATE TRIGGER fail_annotation_delete
      BEFORE DELETE ON annotations
      BEGIN SELECT RAISE(ABORT, 'annotation delete failed'); END;
    `);

    expect(() =>
      deleteAnnotationRowsWithMemoryLifecycle(database, {
        articleId: 'article_1',
        annotationId: 'annotation_1',
      }),
    ).toThrow('annotation delete failed');

    expect(
      readReadingMemoryEntries({ articleId: 'article_1', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['memory_annotation']);
    expect(readReadingMemoryProjectionJobs(database, 1)).toEqual([]);
  });

  it('backfills existing web annotations idempotently and leaves PDFs for lazy fill', () => {
    const database = lifecycleDatabase();
    insertArticle(database, 'web_article');
    insertArticle(database, 'pdf_article');
    const articles = [
      {
        id: 'web_article',
        sourceType: 'web' as const,
        annotations: [
          annotation({
            id: 'web_annotation',
            comments: [
              {
                id: 'web_comment',
                author: { kind: 'user', username: 'reader' },
                content: 'web comment memory',
                createdAt: '2026-05-26T00:10:00.000Z',
              },
            ],
          }),
        ],
      },
      {
        id: 'pdf_article',
        sourceType: 'pdf' as const,
        annotations: [
          annotation({
            id: 'pdf_annotation',
            comments: [
              {
                id: 'pdf_comment',
                author: { kind: 'user', username: 'reader' },
                content: 'pdf comment memory',
                createdAt: '2026-05-26T00:10:00.000Z',
              },
            ],
          }),
        ],
      },
    ];

    const first = backfillArticleAnnotationMemoryEntries(articles, database, { includePdf: false });
    const second = backfillArticleAnnotationMemoryEntries(articles, database, {
      includePdf: false,
    });

    expect(first).toEqual({ articleCount: 1, annotationCount: 1, entryCount: 2 });
    expect(second).toEqual({ articleCount: 1, annotationCount: 1, entryCount: 2 });
    expect(
      readReadingMemoryEntries({ articleId: 'web_article', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['annotation_memory_web_annotation', 'comment_memory_web_comment']);
    expect(readReadingMemoryEntries({ articleId: 'pdf_article', executor: database })).toEqual([]);

    const pdf = backfillArticleAnnotationMemoryEntries(articles, database, { includePdf: true });

    expect(pdf).toEqual({ articleCount: 2, annotationCount: 2, entryCount: 4 });
    expect(
      readReadingMemoryEntries({ articleId: 'pdf_article', executor: database }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['annotation_memory_pdf_annotation', 'comment_memory_pdf_comment']);
  });
});

function articleAnnotationIds(executor: ReadingMemorySqliteExecutor, articleId: string) {
  return executor
    .prepare('SELECT id FROM annotations WHERE article_id = ? ORDER BY id')
    .all(articleId)
    .map((row) => String(recordField(row, 'id')));
}

function lifecycleDatabase(): ReadingMemorySqliteExecutor {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  for (const id of [
    '0001_initial',
    '0002_annotation_type_density',
    '0012_reading_intent',
    '0022_article_ebook_source',
    '0025_annotation_generation_fields',
    '0029_comment_review_label',
    '0035_reading_memory_tape',
    '0043_annotation_distillation',
    '0044_comment_assistant_progress',
    '0054_library_collections_pins',
    '0066_article_source_cleanup_tasks',
    '0067_reading_memory_projection_jobs',
  ]) {
    const migration = migrations.find((item) => item.id === id);
    if (!migration) throw new Error(`missing migration ${id}`);
    database.exec(migration.sql);
  }
  const executor = memoryExecutor(database);
  insertArticle(executor, 'article_1');
  return executor;
}

function articleRowsDatabase(): ReadingMemorySqliteExecutor {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.pragma('foreign_keys = ON');
  for (const migration of migrations) {
    sqlite.exec(migration.sql);
  }

  const database = drizzle(sqlite, { schema });
  const executor: ReadingMemorySqliteExecutor = sqlite;
  storeDbState.database = database;
  storeDbState.executor = executor;
  return executor;
}

type WebArticleRecord = Extract<ArticleRecord, { sourceType: 'web' }>;

function articleRecord(overrides: Partial<WebArticleRecord> = {}): WebArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/book',
    canonicalUrl: 'https://example.com/book',
    sourceType: 'web',
    title: 'Book',
    byline: 'Author',
    excerpt: 'Excerpt',
    siteName: 'Example',
    contentHtml: '<p>目标句子</p>',
    contentHash: 'hash',
    annotations: [],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
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

function insertAnnotation(
  database: ReadingMemorySqliteExecutor,
  id: string,
  articleId = 'article_1',
) {
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
VALUES (?, ?, '{"start":10,"end":14,"exact":"目标句子"}', 'user', '#f4c95d', ?, ?)
`,
    )
    .run(id, articleId, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
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

function insertCollectionReferences(database: ReadingMemorySqliteExecutor, articleId: string) {
  database
    .prepare(
      `
INSERT INTO collections (id, name, created_at, updated_at)
VALUES ('collection_1', '合集', ?, ?)
`,
    )
    .run('2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z');
  database
    .prepare(
      `
INSERT INTO collection_members (collection_id, member_kind, member_id, added_at)
VALUES ('collection_1', 'article', ?, ?)
`,
    )
    .run(articleId, '2026-05-26T00:00:00.000Z');
  database
    .prepare(
      `
INSERT INTO library_pins (target_kind, target_id, pinned_at)
VALUES ('article', ?, ?)
`,
    )
    .run(articleId, '2026-05-26T00:00:00.000Z');
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: {
      start: 10,
      end: 14,
      exact: '目标句子',
      prefix: '前文',
      suffix: '后文',
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-26T00:00:00.000Z',
    updatedAt: '2026-05-26T00:00:00.000Z',
    ...overrides,
  };
}

function annotationComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment_1',
    author: { kind: 'user', username: 'reader' },
    content: 'comment memory',
    createdAt: '2026-05-26T00:10:00.000Z',
    ...overrides,
  };
}

function countRows(database: ReadingMemorySqliteExecutor, table: string) {
  const count = recordField(
    database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(),
    'count',
  );
  return typeof count === 'number' ? count : 0;
}

function commentIds(database: ReadingMemorySqliteExecutor) {
  return database
    .prepare('SELECT id FROM comments ORDER BY id')
    .all()
    .map((row) => recordField(row, 'id'));
}

function memoryExecutor(database: DatabaseSync): ReadingMemorySqliteExecutor {
  return {
    exec: (sql) => database.exec(sql),
    prepare: (sql) => {
      const statement = database.prepare(sql);
      return {
        run: (...values) => statement.run(...values),
        get: (...values) => statement.get(...values),
        all: (...values) => statement.all(...values),
      };
    },
  };
}

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
