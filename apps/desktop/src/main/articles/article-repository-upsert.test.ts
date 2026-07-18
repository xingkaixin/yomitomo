import { describe, expect, it, vi } from 'vitest';
import type { Annotation, Comment, ReadingMemoryEntry } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';

const memoryState = vi.hoisted(() => ({
  entries: [] as ReadingMemoryEntry[],
}));

vi.mock('../reading-memory/reading-memory-store', async (importOriginal) => {
  const original = await importOriginal<typeof import('../reading-memory/reading-memory-store')>();
  return {
    ...original,
    upsertReadingMemoryEntries: (entries: ReadingMemoryEntry[]) => {
      memoryState.entries.push(...entries);
    },
  };
});

import {
  mergeAgentAnnotationRows,
  readArticleRows,
  saveAnnotationDistillationRows,
  upsertAnnotationRows,
  upsertCommentRows,
} from './article-repository';

describe('article repository local child row writes', () => {
  it('upserts one annotation without replacing sibling annotations', () => {
    const database = repositoryDatabase();
    const target = annotation({
      id: 'annotation_1',
      comments: [comment({ id: 'comment_1', content: 'first local memory' })],
      updatedAt: '2026-06-04T01:00:00.000Z',
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, fakeExecutor());

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
      fakeExecutor(),
    );

    const article = readArticleRows(database, 'article_1');
    expect(patch?.article).toMatchObject({
      id: 'article_1',
      annotationCount: 2,
      thoughtCount: 2,
      discussionCommentCount: 2,
      updatedAt: '2026-06-04T02:00:00.000Z',
    });
    expect(patch?.article.annotations.map((item) => item.id).toSorted()).toEqual([
      'annotation_1',
      'sibling_annotation',
    ]);
    expect(patch?.article.annotations.find((item) => item.id === 'annotation_1')?.comments).toEqual(
      [expect.objectContaining({ id: 'comment_1', content: 'updated local memory' })],
    );
    expect(article?.annotations.map((item) => item.id).toSorted()).toEqual([
      'annotation_1',
      'sibling_annotation',
    ]);
    expect(article?.annotations.find((item) => item.id === 'annotation_1')?.comments).toEqual([
      expect.objectContaining({ id: 'comment_1', content: 'updated local memory' }),
    ]);
    expect(memoryState.entries.map((entry) => entry.id)).toContain('comment_memory_comment_1');
  });

  it('upserts one comment without replacing sibling comments', () => {
    const database = repositoryDatabase();
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
      fakeExecutor(),
    );

    const patch = upsertCommentRows(
      database,
      {
        articleId: 'article_1',
        annotationId: 'annotation_1',
        comment: comment({ id: 'comment_2', content: 'updated comment memory' }),
        updatedAt: '2026-06-04T03:00:00.000Z',
      },
      fakeExecutor(),
    );

    const comments = readArticleRows(database, 'article_1')?.annotations.find(
      (item) => item.id === 'annotation_1',
    )?.comments;
    expect(patch?.article).toMatchObject({
      annotationCount: 2,
      thoughtCount: 3,
      discussionCommentCount: 3,
      updatedAt: '2026-06-04T03:00:00.000Z',
    });
    expect(patch?.article.annotations.find((item) => item.id === 'annotation_1')?.comments).toEqual(
      [
        expect.objectContaining({ id: 'comment_1', content: 'keep this comment' }),
        expect.objectContaining({ id: 'comment_2', content: 'updated comment memory' }),
      ],
    );
    expect(comments).toEqual([
      expect.objectContaining({ id: 'comment_1', content: 'keep this comment' }),
      expect.objectContaining({ id: 'comment_2', content: 'updated comment memory' }),
    ]);
    expect(memoryState.entries.map((entry) => entry.id)).toContain('comment_memory_comment_2');
  });

  it('updates only distillation fields without replacing concurrent comments', () => {
    const database = repositoryDatabase();
    const target = annotation({
      id: 'annotation_1',
      comments: [comment({ id: 'comment_1', content: 'existing comment' })],
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, fakeExecutor());
    upsertCommentRows(
      database,
      {
        articleId: 'article_1',
        annotationId: target.id,
        comment: comment({ id: 'comment_2', content: 'concurrent comment' }),
      },
      fakeExecutor(),
    );

    const patch = saveAnnotationDistillationRows(database, {
      articleId: 'article_1',
      annotationId: target.id,
      distillation: {
        status: 'published',
        content: '沉淀内容',
        updatedAt: '2026-06-04T04:00:00.000Z',
      },
      updatedAt: '2026-06-04T04:00:00.000Z',
    });

    const saved = readArticleRows(database, 'article_1')?.annotations.find(
      (item) => item.id === target.id,
    );
    expect(patch?.article.updatedAt).toBe('2026-06-04T04:00:00.000Z');
    expect(saved?.distillation).toMatchObject({ status: 'published', content: '沉淀内容' });
    expect(saved?.comments.map((item) => item.id)).toEqual(['comment_1', 'comment_2']);
  });

  it('merges agent thoughts against the persisted annotation', () => {
    const database = repositoryDatabase();
    const targetAnchor = { start: 20, end: 24, exact: '另一目标句子', prefix: '', suffix: '' };
    const target = annotation({
      id: 'annotation_1',
      anchor: targetAnchor,
      comments: [comment({ id: 'comment_1', content: 'existing comment' })],
      distillation: { status: 'published', content: 'keep distillation' },
    });
    upsertAnnotationRows(database, { articleId: 'article_1', annotation: target }, fakeExecutor());
    const agentComment = comment({
      id: 'comment_2',
      author: 'ai',
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
          author: 'ai',
          comments: [agentComment],
          updatedAt: agentComment.createdAt,
        }),
      },
      fakeExecutor(),
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
    const database = repositoryDatabase();
    upsertAnnotationRows(
      database,
      {
        articleId: 'article_1',
        annotation: annotation({
          id: 'annotation_1',
          comments: [comment({ id: 'comment_1', content: 'article one comment' })],
        }),
      },
      fakeExecutor(),
    );

    const annotationPatch = upsertAnnotationRows(
      database,
      {
        articleId: 'article_2',
        annotation: annotation({ id: 'annotation_1', comments: [] }),
      },
      fakeExecutor(),
    );
    const commentPatch = upsertCommentRows(
      database,
      {
        articleId: 'article_2',
        annotationId: 'annotation_1',
        comment: comment({ id: 'comment_2', content: 'wrong article comment' }),
      },
      fakeExecutor(),
    );

    expect(annotationPatch).toBeNull();
    expect(commentPatch).toBeNull();
    expect(
      readArticleRows(database, 'article_1')?.annotations.find((item) => item.id === 'annotation_1')
        ?.comments,
    ).toEqual([expect.objectContaining({ id: 'comment_1', content: 'article one comment' })]);
  });
});

type Rows = {
  articles: ArticleRow[];
  annotations: AnnotationRow[];
  comments: CommentRow[];
  agents: AgentRow[];
  users: UserProfileRow[];
};
type ArticleRow = typeof schema.articles.$inferSelect;
type AnnotationRow = typeof schema.annotations.$inferSelect;
type CommentRow = typeof schema.comments.$inferSelect;
type AgentRow = typeof schema.agents.$inferSelect;
type UserProfileRow = typeof schema.userProfiles.$inferSelect;
type QueryCondition = { queryChunks?: unknown[] } | undefined;

function repositoryDatabase(): StoreDatabase {
  memoryState.entries = [];
  const rows: Rows = {
    articles: [articleRow('article_1'), articleRow('article_2')],
    annotations: [],
    comments: [],
    agents: [],
    users: [userProfileRow()],
  };
  const database = new FakeStoreDatabase(rows) as unknown as StoreDatabase;
  upsertAnnotationRows(
    database,
    {
      articleId: 'article_1',
      annotation: annotation({
        id: 'sibling_annotation',
        comments: [comment({ id: 'sibling_comment', content: 'sibling comment memory' })],
      }),
    },
    fakeExecutor(),
  );
  memoryState.entries = [];
  return database;
}

function fakeExecutor() {
  return {} as Parameters<typeof upsertAnnotationRows>[2];
}

class FakeStoreDatabase {
  constructor(private readonly rows: Rows) {}

  transaction(run: (tx: FakeStoreDatabase) => unknown) {
    return run(this);
  }

  select(selection?: unknown) {
    return new FakeSelect(this.rows, selection);
  }

  insert(table: unknown) {
    return new FakeInsert(this.rows, table);
  }

  update(table: unknown) {
    return new FakeUpdate(this.rows, table);
  }

  delete(table: unknown) {
    return new FakeDelete(this.rows, table);
  }
}

class FakeSelect {
  private table: unknown;
  private condition: QueryCondition;
  private grouped = false;

  constructor(
    private readonly rows: Rows,
    private readonly selection?: unknown,
  ) {}

  from(table: unknown) {
    this.table = table;
    return this;
  }

  innerJoin() {
    return this;
  }

  where(condition: QueryCondition) {
    this.condition = condition;
    return this;
  }

  groupBy() {
    this.grouped = true;
    return this;
  }

  limit() {
    return this;
  }

  orderBy() {
    return this;
  }

  all() {
    if (this.table === schema.annotations) {
      const articleIds = conditionValues(this.condition);
      if (this.grouped && hasSelectionKey(this.selection, 'annotationCount')) {
        return countAnnotationSummaries(this.rows, articleIds);
      }
      if (this.grouped) return countAnnotations(this.rows, articleIds, this.condition);
      return this.rows.annotations.filter(
        (row) => articleIds.size === 0 || articleIds.has(row.articleId),
      );
    }
    if (this.table === schema.comments) {
      const values = conditionValues(this.condition);
      if (this.grouped && hasSelectionKey(this.selection, 'thoughtCount')) {
        return countCommentSummaries(this.rows, values);
      }
      if (this.grouped) return countRootComments(this.rows, values);
      return this.rows.comments.filter((row) => values.size === 0 || values.has(row.annotationId));
    }
    if (this.table === schema.agents) {
      const values = conditionValues(this.condition);
      return this.rows.agents.filter((row) => values.size === 0 || values.has(row.id));
    }
    if (this.table === schema.userProfiles) {
      const values = conditionValues(this.condition);
      return this.rows.users.filter((row) => values.size === 0 || values.has(row.id));
    }
    return this.rows.articles;
  }

  get() {
    const ids = conditionValues(this.condition);
    if (this.table === schema.annotations) {
      return this.rows.annotations.find((row) => ids.has(row.id)) || null;
    }
    if (this.table === schema.userProfiles) {
      return this.rows.users.find((row) => ids.size === 0 || ids.has(row.id)) || null;
    }
    if (this.table !== schema.articles) return undefined;
    return this.rows.articles.find((article) => ids.has(article.id)) || null;
  }
}

class FakeInsert {
  private valuesInput: unknown;
  private conflictSet: unknown;

  constructor(
    private readonly rows: Rows,
    private readonly table: unknown,
  ) {}

  values(input: unknown) {
    this.valuesInput = input;
    return this;
  }

  onConflictDoUpdate(input: { set: unknown }) {
    this.conflictSet = input.set;
    return this;
  }

  run() {
    for (const row of Array.isArray(this.valuesInput) ? this.valuesInput : [this.valuesInput]) {
      this.upsertRow(row);
    }
  }

  private upsertRow(row: unknown) {
    if (this.table === schema.annotations) {
      upsertById(
        this.rows.annotations,
        row as AnnotationRow,
        this.conflictSet as Partial<AnnotationRow>,
      );
    }
    if (this.table === schema.comments) {
      upsertById(this.rows.comments, row as CommentRow, this.conflictSet as Partial<CommentRow>);
    }
  }
}

class FakeUpdate {
  private patch: Partial<ArticleRow & AnnotationRow> = {};

  constructor(
    private readonly rows: Rows,
    private readonly table: unknown,
  ) {}

  set(patch: Partial<ArticleRow & AnnotationRow>) {
    this.patch = patch;
    return this;
  }

  where(condition: QueryCondition) {
    const ids = conditionValues(condition);
    if (this.table === schema.articles) {
      for (const row of this.rows.articles) {
        if (ids.has(row.id)) Object.assign(row, this.patch);
      }
    }
    if (this.table === schema.annotations) {
      for (const row of this.rows.annotations) {
        if (ids.has(row.id)) Object.assign(row, this.patch);
      }
    }
    return { run: () => undefined };
  }
}

class FakeDelete {
  constructor(
    private readonly rows: Rows,
    private readonly table: unknown,
  ) {}

  where(condition: QueryCondition) {
    const ids = conditionValues(condition);
    if (this.table === schema.comments) {
      this.rows.comments = this.rows.comments.filter((row) => !ids.has(row.annotationId));
    }
    if (this.table === schema.annotations) {
      this.rows.annotations = this.rows.annotations.filter((row) => !ids.has(row.articleId));
      this.rows.comments = this.rows.comments.filter((row) =>
        this.rows.annotations.some((annotationRow) => annotationRow.id === row.annotationId),
      );
    }
    return { run: () => undefined };
  }
}

function upsertById<T extends { id: string }>(rows: T[], row: T, conflictSet: Partial<T>) {
  const index = rows.findIndex((item) => item.id === row.id);
  if (index === -1) rows.push(row);
  else rows[index] = { ...rows[index], ...conflictSet };
}

function countRootComments(rows: Rows, articleIds: Set<string>) {
  const articleByAnnotation = new Map(rows.annotations.map((row) => [row.id, row.articleId]));
  const counts = new Map<string, number>();
  for (const commentRow of rows.comments) {
    if (commentRow.replyTo) continue;
    const articleId = articleByAnnotation.get(commentRow.annotationId);
    if (!articleId || (articleIds.size > 0 && !articleIds.has(articleId))) continue;
    counts.set(articleId, (counts.get(articleId) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([articleId, count]) => ({ articleId, count }));
}

function countCommentSummaries(rows: Rows, articleIds: Set<string>) {
  const articleByAnnotation = new Map(rows.annotations.map((row) => [row.id, row.articleId]));
  const annotationById = new Map(rows.annotations.map((row) => [row.id, row]));
  const counts = new Map<
    string,
    { thoughtCount: number; discussionCommentCount: number; aiCommentCount: number }
  >();
  const primaryAnnotationsByArticle = new Map<string, Set<string>>();
  for (const commentRow of rows.comments) {
    const articleId = articleByAnnotation.get(commentRow.annotationId);
    if (!articleId || (articleIds.size > 0 && !articleIds.has(articleId))) continue;
    const annotationRow = annotationById.get(commentRow.annotationId);
    const count = counts.get(articleId) || {
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
    };
    if (!commentRow.replyTo) count.thoughtCount += 1;
    count.discussionCommentCount += 1;
    if (
      annotationRow &&
      commentRow.author === annotationRow.author &&
      commentRow.createdAt === annotationRow.createdAt
    ) {
      const primaryAnnotations = primaryAnnotationsByArticle.get(articleId) || new Set<string>();
      primaryAnnotations.add(annotationRow.id);
      primaryAnnotationsByArticle.set(articleId, primaryAnnotations);
    }
    if (commentRow.author === 'ai') count.aiCommentCount += 1;
    counts.set(articleId, count);
  }
  return Array.from(counts.entries()).map(([articleId, count]) => ({
    articleId,
    thoughtCount: count.thoughtCount,
    discussionCommentCount:
      count.discussionCommentCount - (primaryAnnotationsByArticle.get(articleId)?.size || 0),
    aiCommentCount: count.aiCommentCount,
  }));
}

function countAnnotations(rows: Rows, articleIds: Set<string>, condition: QueryCondition) {
  const publishedOnly = conditionValues(condition).has('published');
  const counts = new Map<string, number>();
  for (const annotationRow of rows.annotations) {
    if (articleIds.size > 0 && !articleIds.has(annotationRow.articleId)) continue;
    if (publishedOnly && annotationRow.distillationStatus !== 'published') continue;
    counts.set(annotationRow.articleId, (counts.get(annotationRow.articleId) || 0) + 1);
  }
  return Array.from(counts.entries()).map(([articleId, count]) => ({ articleId, count }));
}

function countAnnotationSummaries(rows: Rows, articleIds: Set<string>) {
  const counts = new Map<string, { annotationCount: number; distillationCount: number }>();
  for (const annotationRow of rows.annotations) {
    if (articleIds.size > 0 && !articleIds.has(annotationRow.articleId)) continue;
    const count = counts.get(annotationRow.articleId) || {
      annotationCount: 0,
      distillationCount: 0,
    };
    count.annotationCount += 1;
    if (annotationRow.distillationStatus === 'published') count.distillationCount += 1;
    counts.set(annotationRow.articleId, count);
  }
  return Array.from(counts.entries()).map(([articleId, count]) =>
    Object.assign({ articleId }, count),
  );
}

function hasSelectionKey(selection: unknown, key: string) {
  return Boolean(
    selection &&
    typeof selection === 'object' &&
    Object.prototype.hasOwnProperty.call(selection, key),
  );
}

function conditionValues(condition: QueryCondition) {
  const values = new Set<string>();
  collectConditionValues(condition, values);
  return values;
}

function collectConditionValues(input: unknown, values: Set<string>) {
  if (!input || typeof input !== 'object') return;
  const value = (input as { value?: unknown }).value;
  if (typeof value === 'string') values.add(value);
  const chunks = (input as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) {
        for (const item of chunk) collectConditionValues(item, values);
      } else {
        collectConditionValues(chunk, values);
      }
    }
  }
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
    author: 'user',
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
    author: 'user',
    content: 'comment memory',
    createdAt: '2026-06-04T00:10:00.000Z',
    ...overrides,
  };
}
