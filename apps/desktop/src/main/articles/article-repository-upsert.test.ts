import SQLiteDatabase from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import type { Annotation, Comment } from '@yomitomo/shared';
import { migrations } from '../db/migrations';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import {
  readReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';

import {
  mergeAgentAnnotationRows,
  saveAnnotationDistillationRows,
  upsertAnnotationRows,
  upsertCommentRows,
} from './article-annotation-upsert';
import { readArticleRows } from './article-row-queries';

const openDatabases: SQLiteDatabase.Database[] = [];

describe('article repository local child row writes', () => {
  afterEach(() => {
    for (const database of openDatabases) database.close();
    openDatabases.length = 0;
  });

  it.each(['annotation', 'comment'] as const)(
    'rolls back the %s write with its reading memory and allows retry',
    (operation) => {
      const { database, memory } = repositoryDatabase();
      const target = annotation({ comments: [comment({ content: 'original comment' })] });
      upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, memory);
      const articleBefore = readArticleRows(database, 'article_1');
      const memoryBefore = readReadingMemoryEntries({ articleId: 'article_1', executor: memory });
      const ftsBefore = memory
        .prepare('SELECT * FROM reading_memory_entry_fts ORDER BY entry_id')
        .all();
      const updatedAt = '2026-06-04T03:00:00.000Z';
      const updatedComment = comment({ content: 'updated comment', createdAt: updatedAt });
      const save = () =>
        operation === 'annotation'
          ? upsertAnnotationRows(
              database,
              {
                articleId: 'article_1',
                annotation: { ...target, color: '#96c7ff', comments: [updatedComment], updatedAt },
              },
              memory,
            )
          : upsertCommentRows(
              database,
              {
                articleId: 'article_1',
                annotationId: target.id,
                comment: updatedComment,
                updatedAt,
              },
              memory,
            );
      memory.exec(`
        CREATE TRIGGER fail_comment_memory_insert
        BEFORE INSERT ON reading_memory_entries
        WHEN NEW.id = 'comment_memory_comment_1'
        BEGIN SELECT RAISE(ABORT, 'injected memory write failure'); END;
      `);

      expect(save).toThrow('injected memory write failure');
      expect(readArticleRows(database, 'article_1')).toEqual(articleBefore);
      expect(readReadingMemoryEntries({ articleId: 'article_1', executor: memory })).toEqual(
        memoryBefore,
      );
      expect(
        memory.prepare('SELECT * FROM reading_memory_entry_fts ORDER BY entry_id').all(),
      ).toEqual(ftsBefore);

      memory.exec('DROP TRIGGER fail_comment_memory_insert');
      expect(save()?.article.updatedAt).toBe(updatedAt);
      expect(
        readArticleRows(database, 'article_1')?.annotations.find((item) => item.id === target.id)
          ?.comments[0]?.content,
      ).toBe('updated comment');
      expect(
        readReadingMemoryEntries({ articleId: 'article_1', executor: memory }).find(
          (entry) => entry.id === 'comment_memory_comment_1',
        )?.payload,
      ).toMatchObject({ content: 'updated comment' });
    },
  );

  it('upserts one annotation without replacing sibling annotations', () => {
    const { database, memory } = repositoryDatabase();
    const target = annotation({
      id: 'annotation_1',
      comments: [comment({ id: 'comment_1', content: 'first local memory' })],
      updatedAt: '2026-06-04T01:00:00.000Z',
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, memory);

    const patch = upsertAnnotationRows(
      database,
      {
        articleId: 'article_1',
        annotation: {
          ...target,
          color: '#96c7ff',
          comments: [comment({ id: 'comment_1', content: 'updated local memory' })],
          updatedAt: '2026-06-04T02:00:00.000Z',
        },
      },
      memory,
    );

    const article = readArticleRows(database, 'article_1');
    expect(patch?.article).not.toHaveProperty('annotations');
    expect(patch?.article).toMatchObject({
      id: 'article_1',
      counts: {
        annotationCount: 2,
        thoughtCount: 2,
        discussionCommentCount: 2,
      },
      updatedAt: '2026-06-04T02:00:00.000Z',
    });
    expect(article?.annotations.map((item) => item.id).toSorted()).toEqual([
      'annotation_1',
      'sibling_annotation',
    ]);
    expect(article?.annotations.find((item) => item.id === 'annotation_1')?.comments).toEqual([
      expect.objectContaining({ id: 'comment_1', content: 'updated local memory' }),
    ]);
    expect(readReadingMemoryEntries({ articleId: 'article_1', executor: memory })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'comment_memory_comment_1' })]),
    );
  });

  it('upserts one comment without replacing sibling comments', () => {
    const { database, memory } = repositoryDatabase();
    upsertAnnotationRows(
      database,
      {
        articleId: 'article_1',
        annotation: {
          ...annotation({ id: 'annotation_1' }),
          comments: [
            comment({ id: 'comment_1', content: 'keep this comment' }),
            comment({ id: 'comment_2', content: 'old comment' }),
          ],
        },
      },
      memory,
    );

    const patch = upsertCommentRows(
      database,
      {
        articleId: 'article_1',
        annotationId: 'annotation_1',
        comment: comment({ id: 'comment_2', content: 'updated comment memory' }),
        updatedAt: '2026-06-04T03:00:00.000Z',
      },
      memory,
    );

    const comments = readArticleRows(database, 'article_1')?.annotations.find(
      (item) => item.id === 'annotation_1',
    )?.comments;
    expect(patch?.article).not.toHaveProperty('annotations');
    expect(patch?.article).toMatchObject({
      counts: {
        annotationCount: 2,
        thoughtCount: 3,
        discussionCommentCount: 3,
      },
      updatedAt: '2026-06-04T03:00:00.000Z',
    });
    expect(comments).toEqual([
      expect.objectContaining({ id: 'comment_1', content: 'keep this comment' }),
      expect.objectContaining({ id: 'comment_2', content: 'updated comment memory' }),
    ]);
    expect(readReadingMemoryEntries({ articleId: 'article_1', executor: memory })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'comment_memory_comment_2' })]),
    );
  });

  it('updates only distillation fields without replacing concurrent comments', () => {
    const { database, memory } = repositoryDatabase();
    const target = annotation({
      id: 'annotation_1',
      comments: [comment({ id: 'comment_1', content: 'existing comment' })],
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, memory);
    upsertCommentRows(
      database,
      {
        articleId: 'article_1',
        annotationId: target.id,
        comment: comment({ id: 'comment_2', content: 'concurrent comment' }),
      },
      memory,
    );

    const patch = saveAnnotationDistillationRows(database, {
      articleId: 'article_1',
      annotationId: target.id,
      expectedDistillationUpdatedAt: null,
      distillation: {
        status: 'published',
        content: '沉淀内容',
        updatedAt: '2026-06-04T04:00:00.000Z',
        reviewSessions: [
          {
            id: 'review_session_1',
            agentId: 'agent_1',
            agentUsername: 'reviewer',
            messages: [
              {
                id: 'review_message_1',
                author: {
                  kind: 'agent',
                  agentId: 'agent_1',
                  username: 'reviewer',
                  nickname: '审阅助手',
                  avatar: 'reviewer-avatar',
                },
                content: '沉淀还需要补足证据。',
                createdAt: '2026-06-04T04:00:00.000Z',
              },
              {
                id: 'review_message_2',
                author: { kind: 'user', username: 'reader' },
                content: '请补充原文依据。',
                createdAt: '2026-06-04T04:01:00.000Z',
              },
            ],
            createdAt: '2026-06-04T04:00:00.000Z',
            updatedAt: '2026-06-04T04:00:00.000Z',
          },
        ],
      },
      updatedAt: '2026-06-04T04:00:00.000Z',
    });

    const saved = readArticleRows(database, 'article_1')?.annotations.find(
      (item) => item.id === target.id,
    );
    const row = database
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, target.id))
      .get();
    const reviewSessions = storedReviewSessions(row?.distillationReviewSessions);
    expect(patch?.article.updatedAt).toBe('2026-06-04T04:00:00.000Z');
    expect(saved?.distillation).toMatchObject({ status: 'published', content: '沉淀内容' });
    expect(saved?.distillation?.reviewSessions?.[0]?.messages[0]?.author).toEqual({
      kind: 'agent',
      agentId: 'agent_1',
      username: 'reviewer',
      nickname: '审阅助手',
      avatar: 'reviewer-avatar',
    });
    expect(saved?.distillation?.reviewSessions?.[0]?.messages[1]?.author).toEqual({
      kind: 'user',
      username: 'reader',
    });
    expect(reviewSessions).toMatchObject([
      {
        messages: [
          {
            author: 'ai',
            agentId: 'agent_1',
            agentUsername: 'reviewer',
            agentNickname: '审阅助手',
            agentAvatar: 'reviewer-avatar',
          },
          { author: 'user' },
        ],
      },
    ]);
    expect(reviewSessions[0]?.messages[0]).not.toHaveProperty('kind');
    expect(reviewSessions[0]?.messages[1]).not.toHaveProperty('kind');
    expect(saved?.comments.map((item) => item.id)).toEqual(['comment_1', 'comment_2']);
  });

  it('rejects a distillation write based on a stale version', () => {
    const { database, memory } = repositoryDatabase();
    const target = annotation({ id: 'annotation_1' });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, memory);

    saveAnnotationDistillationRows(database, {
      articleId: 'article_1',
      annotationId: target.id,
      distillation: {
        status: 'unpublished',
        content: 'newer content',
        updatedAt: '2026-06-04T04:00:00.000Z',
      },
      expectedDistillationUpdatedAt: null,
      updatedAt: '2026-06-04T04:00:00.000Z',
    });

    expect(() =>
      saveAnnotationDistillationRows(database, {
        articleId: 'article_1',
        annotationId: target.id,
        distillation: {
          status: 'published',
          content: 'stale content',
          updatedAt: '2026-06-04T05:00:00.000Z',
        },
        expectedDistillationUpdatedAt: null,
        updatedAt: '2026-06-04T05:00:00.000Z',
      }),
    ).toThrow('ANNOTATION_DISTILLATION_CONFLICT');
    expect(
      readArticleRows(database, 'article_1')?.annotations.find((item) => item.id === target.id)
        ?.distillation,
    ).toMatchObject({ status: 'unpublished', content: 'newer content' });
  });

  it('merges agent thoughts against the persisted annotation', () => {
    const { database, memory } = repositoryDatabase();
    const targetAnchor = { start: 20, end: 24, exact: '另一目标句子', prefix: '', suffix: '' };
    const target = annotation({
      id: 'annotation_1',
      anchor: targetAnchor,
      comments: [comment({ id: 'comment_1', content: 'existing comment' })],
      distillation: { status: 'published', content: 'keep distillation' },
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, memory);
    const agentComment = comment({
      id: 'comment_2',
      author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
      content: 'agent thought',
      createdAt: '2026-06-04T05:00:00.000Z',
    });

    const result = mergeAgentAnnotationRows(
      database,
      {
        articleId: 'article_1',
        annotation: annotation({
          id: 'agent_annotation',
          anchor: targetAnchor,
          author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
          comments: [agentComment],
          updatedAt: agentComment.createdAt,
        }),
      },
      memory,
    );

    const saved = readArticleRows(database, 'article_1')?.annotations.find(
      (item) => item.id === target.id,
    );
    expect(result?.activeId).toBe(target.id);
    expect(saved?.distillation?.content).toBe('keep distillation');
    expect(saved?.comments.map((item) => item.id)).toEqual(['comment_1', 'comment_2']);
    expect(readArticleRows(database, 'article_1')?.annotations).toHaveLength(2);
  });

  it('does not move child rows across articles when ids are mismatched', () => {
    const { database, memory } = repositoryDatabase();
    upsertAnnotationRows(
      database,
      {
        articleId: 'article_1',
        annotation: annotation({
          id: 'annotation_1',
          comments: [comment({ id: 'comment_1', content: 'article one comment' })],
        }),
      },
      memory,
    );

    const annotationPatch = upsertAnnotationRows(
      database,
      {
        articleId: 'article_2',
        annotation: annotation({ id: 'annotation_1', comments: [] }),
      },
      memory,
    );
    const commentPatch = upsertCommentRows(
      database,
      {
        articleId: 'article_2',
        annotationId: 'annotation_1',
        comment: comment({ id: 'comment_2', content: 'wrong article comment' }),
      },
      memory,
    );

    expect(annotationPatch).toBeNull();
    expect(commentPatch).toBeNull();
    expect(
      readArticleRows(database, 'article_1')?.annotations.find((item) => item.id === 'annotation_1')
        ?.comments,
    ).toEqual([expect.objectContaining({ id: 'comment_1', content: 'article one comment' })]);
  });
});

type ArticleRow = typeof schema.articles.$inferSelect;
type UserProfileRow = typeof schema.userProfiles.$inferSelect;

function repositoryDatabase(): {
  database: StoreDatabase;
  memory: ReadingMemorySqliteExecutor;
} {
  const sqlite = new SQLiteDatabase(':memory:');
  openDatabases.push(sqlite);
  sqlite.pragma('foreign_keys = ON');
  for (const migration of migrations) sqlite.exec(migration.sql);

  const database: StoreDatabase = drizzle(sqlite, { schema });
  database
    .insert(schema.articles)
    .values([articleRow('article_1'), articleRow('article_2')])
    .run();
  database.insert(schema.userProfiles).values(userProfileRow()).run();

  const memory = readingMemoryExecutor(sqlite);
  upsertAnnotationRows(
    database,
    {
      articleId: 'article_1',
      annotation: annotation({
        id: 'sibling_annotation',
        comments: [comment({ id: 'sibling_comment', content: 'sibling comment memory' })],
      }),
    },
    memory,
  );
  return { database, memory };
}

function readingMemoryExecutor(database: SQLiteDatabase.Database): ReadingMemorySqliteExecutor {
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

function articleRow(id: string): ArticleRow {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    sourceType: 'web',
    title: 'Article',
    byline: null,
    excerpt: null,
    siteName: null,
    siteIconUrl: null,
    leadImageUrl: null,
    themeColor: null,
    contentHtml: null,
    contentHash: 'hash',
    ebookMetadata: null,
    ebookChapters: null,
    ebookIndex: null,
    pdfMetadata: null,
    textMetadata: null,
    readingProgress: null,
    readerChatState: null,
    focusCoReadingPlan: null,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
  };
}

function userProfileRow(): UserProfileRow {
  return {
    id: 'user-test',
    nickname: 'Kevin',
    username: 'kevin',
    avatar: 'user-avatar',
    annotationColor: '#f59e0b',
    updatedAt: '2026-06-04T00:00:00.000Z',
  };
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
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

function comment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment_1',
    author: { kind: 'user', username: 'reader' },
    content: 'comment memory',
    createdAt: '2026-06-04T00:10:00.000Z',
    ...overrides,
  };
}

type StoredReviewMessage = {
  author: 'ai' | 'user';
  kind?: unknown;
};

type StoredReviewSession = {
  messages: StoredReviewMessage[];
};

function storedReviewSessions(value: unknown): StoredReviewSession[] {
  if (!Array.isArray(value)) throw new Error('Expected stored review sessions');
  return value.map((session) => {
    if (!isRecord(session) || !Array.isArray(session.messages)) {
      throw new Error('Expected stored review session messages');
    }
    if (!session.messages.every(isStoredReviewMessage)) {
      throw new Error('Expected stored review message authors');
    }
    return { messages: session.messages };
  });
}

function isStoredReviewMessage(value: unknown): value is StoredReviewMessage {
  return isRecord(value) && (value.author === 'ai' || value.author === 'user');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
