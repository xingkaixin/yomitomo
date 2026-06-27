import { describe, expect, it } from 'vitest';
import SQLiteDatabase from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import type { ArticleSummaryRow } from '../store/store-normalizers';
import {
  readArticleLibraryListRows,
  readArticleSummaryCounts,
  readArticleSummaryCountsForArticles,
  readArticleSummaryRows,
} from './article-repository';

describe('article repository summaries', () => {
  it('reads scoped summary counts for selected articles only', () => {
    const database = repositoryDatabase();
    const profile: StoreReadProfileEntry[] = [];

    const counts = readArticleSummaryCountsForArticles(database, ['article_a'], profile);

    expect(counts.size).toBe(1);
    expect(counts.get('article_a')).toEqual({
      annotationCount: 2,
      commentCount: 1,
      aiCommentCount: 2,
      distillationCount: 1,
    });
    expect(counts.has('article_b')).toBe(false);
    expect(profile.map((entry) => entry.name)).toEqual([
      'count_annotation_summary_by_article_scoped',
      'count_comment_summary_by_article_scoped',
      'read_distillation_review_sessions_by_article_scoped',
    ]);
  });

  it('keeps full summary count aggregation unscoped', () => {
    const counts = readArticleSummaryCounts(repositoryDatabase());

    expect(counts.get('article_a')).toEqual({
      annotationCount: 2,
      commentCount: 1,
      aiCommentCount: 2,
      distillationCount: 1,
    });
    expect(counts.get('article_b')).toEqual({
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 1,
      distillationCount: 1,
    });
  });

  it('uses scoped counts when reading one article summary', () => {
    const article = readArticleSummaryRows(repositoryDatabase(), 'article_a');

    expect(article).toMatchObject({
      id: 'article_a',
      annotationCount: 2,
      commentCount: 1,
      aiCommentCount: 2,
      distillationCount: 1,
    });
  });

  it('skips count queries for an empty scoped article list', () => {
    const profile: StoreReadProfileEntry[] = [];

    expect(readArticleSummaryCountsForArticles(repositoryDatabase(), [], profile).size).toBe(0);
    expect(profile).toEqual([]);
  });

  it('reads a paged library list with source counts and scoped article counts', () => {
    const profile: StoreReadProfileEntry[] = [];

    const result = readArticleLibraryListRows(
      repositoryDatabase(),
      { source: 'web', page: 1, pageSize: 1 },
      profile,
    );

    expect(result).toMatchObject({
      page: 1,
      pageSize: 1,
      query: '',
      source: 'web',
      sourceCounts: { web: 2, ebook: 1, pdf: 0 },
      totalCount: 2,
    });
    expect(result.articles.map((article) => article.id)).toEqual(['article_c']);
    expect(result.articles[0].annotationCount).toBe(0);
    expect(profile.map((entry) => entry.name)).toContain(
      'count_annotation_summary_by_article_scoped',
    );
  });

  it('filters library pages by source metadata search', () => {
    const result = readArticleLibraryListRows(sqliteRepositoryDatabase(), {
      source: 'web',
      query: 'alpha',
      page: 1,
      pageSize: 10,
    });

    expect(result.totalCount).toBe(1);
    expect(result.articles.map((article) => article.id)).toEqual(['sqlite_alpha']);
  });

  it('combines summary count reads without changing sqlite count semantics', () => {
    const database = summaryCountsSqliteDatabase(200, 50);
    const fullProfile: StoreReadProfileEntry[] = [];
    const scopedProfile: StoreReadProfileEntry[] = [];

    const fullCounts = readArticleSummaryCounts(database, fullProfile);
    const scopedCounts = readArticleSummaryCountsForArticles(
      database,
      ['article_1', 'article_2', 'article_3', 'article_4', 'article_5'],
      scopedProfile,
    );

    expect(fullCounts.get('article_1')).toEqual({
      annotationCount: 50,
      commentCount: 56,
      aiCommentCount: 72,
      distillationCount: 10,
    });
    expect(scopedCounts.get('article_1')).toEqual(fullCounts.get('article_1'));
    expect(scopedCounts.size).toBe(5);
    expect(fullProfile.map((entry) => entry.name)).toEqual([
      'count_annotation_summary_by_article',
      'count_comment_summary_by_article',
      'read_distillation_review_sessions_by_article',
    ]);
    expect(scopedProfile.map((entry) => entry.name)).toEqual([
      'count_annotation_summary_by_article_scoped',
      'count_comment_summary_by_article_scoped',
      'read_distillation_review_sessions_by_article_scoped',
    ]);
  });
});

type QueryCondition = { queryChunks?: unknown[] } | undefined;

type ArticleRow = ArticleSummaryRow;
type AnnotationRow = {
  id: string;
  articleId: string;
  distillationStatus?: string;
  distillationReviewSessions?: Array<{ messages: Array<{ author: string }> }>;
};
type CommentRow = {
  id: string;
  annotationId: string;
  author: string;
  replyTo?: string;
};

function repositoryDatabase(): StoreDatabase {
  const rows = {
    articles: [
      articleRow('article_a', {
        createdAt: '2026-06-04T00:00:00.000Z',
        title: 'Alpha article',
      }),
      articleRow('article_b', {
        createdAt: '2026-06-05T00:00:00.000Z',
        sourceType: 'ebook',
      }),
      articleRow('article_c', {
        createdAt: '2026-06-06T00:00:00.000Z',
      }),
    ],
    annotations: [
      annotationRow('annotation_a_1', 'article_a', 'published', 1),
      annotationRow('annotation_a_2', 'article_a'),
      annotationRow('annotation_b_1', 'article_b', 'published'),
    ],
    comments: [
      commentRow('comment_a_1', 'annotation_a_1'),
      commentRow('reply_a_1', 'annotation_a_1', 'ai', 'comment_a_1'),
      commentRow('comment_b_1', 'annotation_b_1', 'ai'),
    ],
  };
  return {
    select: (selection?: unknown) => new FakeSelect(rows, selection),
  } as unknown as StoreDatabase;
}

function sqliteRepositoryDatabase(): StoreDatabase {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.exec(`
    CREATE TABLE articles (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      canonical_url TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'web',
      title TEXT NOT NULL,
      byline TEXT,
      excerpt TEXT,
      site_name TEXT,
      theme_color TEXT,
      content_hash TEXT NOT NULL,
      ebook_metadata TEXT,
      pdf_metadata TEXT,
      reading_progress TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      distillation_status TEXT,
      distillation_review_sessions TEXT
    );
    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      annotation_id TEXT NOT NULL,
      author TEXT NOT NULL,
      reply_to TEXT
    );
  `);
  sqlite
    .prepare(
      `INSERT INTO articles (
        id, url, canonical_url, source_type, title, byline, excerpt, site_name,
        theme_color, content_hash, ebook_metadata, pdf_metadata, reading_progress,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sqlite_alpha',
      'https://example.com/alpha',
      'https://example.com/alpha',
      'web',
      'Alpha article',
      null,
      null,
      null,
      null,
      'hash-alpha',
      null,
      null,
      null,
      '2026-06-06T00:00:00.000Z',
      '2026-06-06T00:00:00.000Z',
    );
  sqlite
    .prepare(
      `INSERT INTO articles (
        id, url, canonical_url, source_type, title, byline, excerpt, site_name,
        theme_color, content_hash, ebook_metadata, pdf_metadata, reading_progress,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      'sqlite_beta',
      'https://example.com/beta',
      'https://example.com/beta',
      'web',
      'Beta article',
      null,
      null,
      null,
      null,
      'hash-beta',
      null,
      null,
      null,
      '2026-06-05T00:00:00.000Z',
      '2026-06-05T00:00:00.000Z',
    );
  return drizzle(sqlite, { schema });
}

function summaryCountsSqliteDatabase(articleCount: number, annotationsPerArticle: number) {
  const sqlite = new SQLiteDatabase(':memory:');
  sqlite.exec(`
    CREATE TABLE annotations (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      distillation_status TEXT,
      distillation_review_sessions TEXT
    );
    CREATE TABLE comments (
      id TEXT PRIMARY KEY,
      annotation_id TEXT NOT NULL,
      author TEXT NOT NULL,
      reply_to TEXT
    );
  `);
  const insertAnnotation = sqlite.prepare(
    `INSERT INTO annotations (
      id, article_id, distillation_status, distillation_review_sessions
    ) VALUES (?, ?, ?, ?)`,
  );
  const insertComment = sqlite.prepare(
    'INSERT INTO comments (id, annotation_id, author, reply_to) VALUES (?, ?, ?, ?)',
  );
  sqlite.transaction(() => {
    for (let articleIndex = 0; articleIndex < articleCount; articleIndex += 1) {
      const articleId = `article_${articleIndex}`;
      for (let annotationIndex = 0; annotationIndex < annotationsPerArticle; annotationIndex += 1) {
        const annotationId = `${articleId}_annotation_${annotationIndex}`;
        const reviewSessions =
          annotationIndex % 7 === 0
            ? JSON.stringify([
                { messages: [{ author: 'ai' }, { author: 'user' }, { author: 'ai' }] },
              ])
            : null;
        insertAnnotation.run(
          annotationId,
          articleId,
          annotationIndex % 5 === 0 ? 'published' : null,
          reviewSessions,
        );
        insertComment.run(`${annotationId}_comment_user`, annotationId, 'user', null);
        insertComment.run(
          `${annotationId}_comment_ai_reply`,
          annotationId,
          'ai',
          `${annotationId}_comment_user`,
        );
        if (annotationIndex % 9 === 0) {
          insertComment.run(`${annotationId}_comment_ai_top`, annotationId, 'ai', null);
        }
      }
    }
  })();
  return drizzle(sqlite, { schema });
}

class FakeSelect {
  private table: unknown;
  private condition: QueryCondition;
  private grouped = false;
  private limitValue: number | null = null;
  private offsetValue = 0;

  constructor(
    private readonly rows: {
      articles: ArticleRow[];
      annotations: AnnotationRow[];
      comments: CommentRow[];
    },
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

  orderBy() {
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  offset(value: number) {
    this.offsetValue = value;
    return this;
  }

  all() {
    if (this.table === schema.articles) {
      const rows = filterArticles(this.rows.articles, this.condition);
      if (this.grouped) return countBySource(rows);
      return rows
        .toSorted(
          (left, right) =>
            Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
            Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
            left.title.localeCompare(right.title, 'zh-CN'),
        )
        .slice(this.offsetValue, this.limitValue ? this.offsetValue + this.limitValue : undefined);
    }
    if (this.table === schema.annotations) {
      if (!this.grouped)
        return filterAnnotations(this.rows.annotations, this.condition).map((row) => ({
          articleId: row.articleId,
          reviewSessions: row.distillationReviewSessions,
        }));
      if (hasSelectionKey(this.selection, 'annotationCount')) {
        return countAnnotationSummaries(this.rows.annotations, this.condition);
      }
      return countAnnotations(this.rows.annotations, this.condition);
    }
    if (this.table === schema.comments) {
      if (hasSelectionKey(this.selection, 'commentCount')) {
        return countCommentSummaries(this.rows.annotations, this.rows.comments, this.condition);
      }
      return countComments(this.rows.annotations, this.rows.comments, this.condition);
    }
    return this.rows.articles;
  }

  get() {
    const articleIds = articleIdsFromCondition(this.condition);
    if (this.table !== schema.articles) return undefined;
    if (isCountSelection(this.selection)) {
      return { count: filterArticles(this.rows.articles, this.condition).length };
    }
    return this.rows.articles.find((article) => articleIds.has(article.id)) || null;
  }
}

function isCountSelection(selection: unknown) {
  return hasSelectionKey(selection, 'count');
}

function hasSelectionKey(selection: unknown, key: string) {
  return Boolean(
    selection &&
    typeof selection === 'object' &&
    Object.prototype.hasOwnProperty.call(selection, key),
  );
}

function filterArticles(rows: ArticleRow[], condition: QueryCondition) {
  const values = conditionValues(condition);
  const source = ['web', 'ebook', 'pdf'].find((item) => values.has(item));
  const search = Array.from(values).find((value) => value.startsWith('%') && value.endsWith('%'));
  const normalizedSearch = search?.slice(1, -1).toLocaleLowerCase('zh-CN');
  return rows.filter((row) => {
    if (source && row.sourceType !== source) return false;
    if (!normalizedSearch) return true;
    return [
      row.title,
      row.byline,
      row.siteName,
      row.excerpt,
      row.url,
      row.canonicalUrl,
      row.ebookMetadata ? JSON.stringify(row.ebookMetadata) : '',
      row.pdfMetadata ? JSON.stringify(row.pdfMetadata) : '',
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedSearch);
  });
}

function countBySource(rows: ArticleRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.sourceType, (counts.get(row.sourceType) || 0) + 1);
  return Array.from(counts.entries()).map(([sourceType, count]) => ({ sourceType, count }));
}

function countAnnotations(rows: AnnotationRow[], condition: QueryCondition) {
  return countByArticle(
    filterAnnotations(rows, condition, conditionValues(condition).has('published')),
  );
}

function countAnnotationSummaries(rows: AnnotationRow[], condition: QueryCondition) {
  return Array.from(groupRowsByArticle(filterAnnotations(rows, condition)).entries()).map(
    ([articleId, articleRows]) => ({
      articleId,
      annotationCount: articleRows.length,
      distillationCount: articleRows.filter((row) => row.distillationStatus === 'published').length,
    }),
  );
}

function filterAnnotations(
  rows: AnnotationRow[],
  condition: QueryCondition,
  publishedOnly = false,
) {
  const scopedArticleIds = articleIdsFromCondition(condition);
  return rows.filter((row) => {
    if (scopedArticleIds.size > 0 && !scopedArticleIds.has(row.articleId)) return false;
    return !publishedOnly || row.distillationStatus === 'published';
  });
}

function countComments(
  annotations: AnnotationRow[],
  comments: CommentRow[],
  condition: QueryCondition,
) {
  const scopedArticleIds = articleIdsFromCondition(condition);
  const aiOnly = conditionValues(condition).has('ai');
  const articleByAnnotation = new Map(
    annotations.map((annotation) => [annotation.id, annotation.articleId]),
  );
  const rows = comments
    .filter((comment) => (aiOnly ? comment.author === 'ai' : !comment.replyTo))
    .flatMap((comment) => {
      const articleId = articleByAnnotation.get(comment.annotationId);
      if (!articleId) return [];
      if (scopedArticleIds.size > 0 && !scopedArticleIds.has(articleId)) return [];
      return [{ articleId }];
    });
  return countByArticle(rows);
}

function countCommentSummaries(
  annotations: AnnotationRow[],
  comments: CommentRow[],
  condition: QueryCondition,
) {
  const scopedArticleIds = articleIdsFromCondition(condition);
  const articleByAnnotation = new Map(
    annotations.map((annotation) => [annotation.id, annotation.articleId]),
  );
  const counts = new Map<string, { commentCount: number; aiCommentCount: number }>();
  for (const comment of comments) {
    const articleId = articleByAnnotation.get(comment.annotationId);
    if (!articleId) continue;
    if (scopedArticleIds.size > 0 && !scopedArticleIds.has(articleId)) continue;
    const count = counts.get(articleId) || { commentCount: 0, aiCommentCount: 0 };
    if (!comment.replyTo) count.commentCount += 1;
    if (comment.author === 'ai') count.aiCommentCount += 1;
    counts.set(articleId, count);
  }
  return Array.from(counts.entries()).map(([articleId, count]) =>
    Object.assign({ articleId }, count),
  );
}

function groupRowsByArticle<T extends { articleId: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const articleRows = grouped.get(row.articleId) || [];
    articleRows.push(row);
    grouped.set(row.articleId, articleRows);
  }
  return grouped;
}

function countByArticle(rows: Array<{ articleId: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.articleId, (counts.get(row.articleId) || 0) + 1);
  return Array.from(counts.entries()).map(([articleId, count]) => ({ articleId, count }));
}

function conditionValues(condition: QueryCondition) {
  const values = new Set<string>();
  collectConditionValues(condition, values, new WeakSet<object>());
  return values;
}

function collectConditionValues(input: unknown, values: Set<string>, seen: WeakSet<object>) {
  if (!input || typeof input !== 'object') return;
  if (seen.has(input)) return;
  seen.add(input);
  const value = (input as { value?: unknown }).value;
  if (typeof value === 'string') values.add(value);
  const chunks = (input as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) {
        for (const item of chunk) collectConditionValues(item, values, seen);
      } else {
        collectConditionValues(chunk, values, seen);
      }
    }
  }
  for (const key of Reflect.ownKeys(input)) {
    collectConditionValues((input as Record<PropertyKey, unknown>)[key], values, seen);
  }
}

function articleIdsFromCondition(condition: QueryCondition) {
  const values = conditionValues(condition);
  return new Set(['article_a', 'article_b', 'article_c'].filter((id) => values.has(id)));
}

function articleRow(id: string, overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    sourceType: 'web',
    title: id,
    byline: null,
    excerpt: null,
    siteName: null,
    themeColor: null,
    contentHash: `hash-${id}`,
    ebookMetadata: null,
    pdfMetadata: null,
    readingProgress: null,
    createdAt: '2026-06-04T00:00:00.000Z',
    updatedAt: '2026-06-04T00:00:00.000Z',
    ...overrides,
  };
}

function annotationRow(
  id: string,
  articleId: string,
  distillationStatus?: string,
  aiReviewMessages = 0,
): AnnotationRow {
  return {
    id,
    articleId,
    distillationStatus,
    distillationReviewSessions:
      aiReviewMessages > 0
        ? [{ messages: Array.from({ length: aiReviewMessages }, () => ({ author: 'ai' })) }]
        : undefined,
  };
}

function commentRow(
  id: string,
  annotationId: string,
  authorOrReplyTo?: string,
  replyTo?: string,
): CommentRow {
  const author = authorOrReplyTo === 'ai' ? 'ai' : 'user';
  return {
    id,
    annotationId,
    author,
    replyTo: authorOrReplyTo === 'ai' ? replyTo : authorOrReplyTo,
  };
}
