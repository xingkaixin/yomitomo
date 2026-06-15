import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import type { ArticleSummaryRow } from '../store/store-normalizers';
import {
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
      'count_annotations_by_article_scoped',
      'count_comments_by_article_scoped',
      'count_ai_comments_by_article_scoped',
      'count_distillations_by_article_scoped',
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
    articles: [articleRow('article_a'), articleRow('article_b')],
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
    select: () => new FakeSelect(rows),
  } as unknown as StoreDatabase;
}

class FakeSelect {
  private table: unknown;
  private condition: QueryCondition;
  private grouped = false;

  constructor(
    private readonly rows: {
      articles: ArticleRow[];
      annotations: AnnotationRow[];
      comments: CommentRow[];
    },
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

  all() {
    if (this.table === schema.annotations) {
      if (!this.grouped)
        return filterAnnotations(this.rows.annotations, this.condition).map((row) => ({
          articleId: row.articleId,
          reviewSessions: row.distillationReviewSessions,
        }));
      return countAnnotations(this.rows.annotations, this.condition);
    }
    if (this.table === schema.comments) {
      return countComments(this.rows.annotations, this.rows.comments, this.condition);
    }
    return this.rows.articles;
  }

  get() {
    const articleIds = articleIdsFromCondition(this.condition);
    if (this.table !== schema.articles) return undefined;
    return this.rows.articles.find((article) => articleIds.has(article.id)) || null;
  }
}

function countAnnotations(rows: AnnotationRow[], condition: QueryCondition) {
  return countByArticle(
    filterAnnotations(rows, condition, conditionValues(condition).has('published')),
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

function countByArticle(rows: Array<{ articleId: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.articleId, (counts.get(row.articleId) || 0) + 1);
  return Array.from(counts.entries()).map(([articleId, count]) => ({ articleId, count }));
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

function articleIdsFromCondition(condition: QueryCondition) {
  const values = conditionValues(condition);
  return new Set(['article_a', 'article_b'].filter((id) => values.has(id)));
}

function articleRow(id: string): ArticleRow {
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
