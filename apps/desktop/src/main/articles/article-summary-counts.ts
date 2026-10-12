import { and, count, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { ArticleActivityDates, ArticleCounts } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import { measureStoreRead } from '../store/store-read-profile';

export function readArticleSummaryCounts(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  return readArticleSummaryCountsInternal(database, profile);
}

export function readArticleSummaryCountsForArticles(
  database: StoreDatabase,
  articleIds: string[],
  profile?: StoreReadProfileEntry[],
) {
  if (articleIds.length === 0) return new Map<string, ArticleCounts>();
  return readArticleSummaryCountsInternal(database, profile, {
    articleIds: Array.from(new Set(articleIds)),
    profileNameSuffix: '_scoped',
  });
}

function readArticleSummaryCountsInternal(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
  scope?: { articleIds: string[]; profileNameSuffix: string },
) {
  const articleFilter = scope ? inArray(schema.annotations.articleId, scope.articleIds) : undefined;
  const profileName = (name: string) => `${name}${scope?.profileNameSuffix || ''}`;
  const annotationSummaryCounts = measureStoreRead(
    profile,
    profileName('count_annotation_summary_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          annotationCount: count(),
          distillationCount: sql<number>`coalesce(sum(case when ${schema.annotations.distillationStatus} = ${'published'} then 1 else 0 end), 0)`,
        })
        .from(schema.annotations)
        .where(articleFilter)
        .groupBy(schema.annotations.articleId)
        .all(),
  );
  const commentSummaryCounts = measureStoreRead(
    profile,
    profileName('count_comment_summary_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          thoughtCount: sql<number>`coalesce(sum(case when ${schema.comments.replyTo} is null then 1 else 0 end), 0)`,
          discussionCommentCount: sql<number>`count(*) - count(distinct case when ${schema.comments.author} = ${schema.annotations.author} and ${schema.comments.createdAt} = ${schema.annotations.createdAt} then ${schema.annotations.id} end)`,
          aiCommentCount: sql<number>`coalesce(sum(case when ${schema.comments.author} = ${'ai'} then 1 else 0 end), 0)`,
        })
        .from(schema.comments)
        .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
        .where(articleFilter)
        .groupBy(schema.annotations.articleId)
        .all(),
  );
  const distillationReviewRows = measureStoreRead(
    profile,
    profileName('read_distillation_review_sessions_by_article'),
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          reviewSessions: schema.annotations.distillationReviewSessions,
        })
        .from(schema.annotations)
        .where(
          andConditions(articleFilter, isNotNull(schema.annotations.distillationReviewSessions)),
        )
        .all(),
  );
  const countsByArticle = new Map<string, ArticleCounts>();

  for (const row of annotationSummaryCounts) {
    countsByArticle.set(row.articleId, {
      annotationCount: row.annotationCount || 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: row.distillationCount || 0,
    });
  }

  for (const row of commentSummaryCounts) {
    const counts = countsByArticle.get(row.articleId);
    if (counts) {
      counts.thoughtCount = row.thoughtCount || 0;
      counts.discussionCommentCount = row.discussionCommentCount || 0;
      counts.aiCommentCount = row.aiCommentCount || 0;
    } else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        thoughtCount: row.thoughtCount || 0,
        discussionCommentCount: row.discussionCommentCount || 0,
        aiCommentCount: row.aiCommentCount || 0,
        distillationCount: 0,
      });
  }

  for (const row of distillationReviewRows) {
    const aiReviewMessageCount = aiDistillationReviewMessageDates(row.reviewSessions).length;
    if (aiReviewMessageCount === 0) continue;
    const counts = countsByArticle.get(row.articleId);
    if (counts) counts.aiCommentCount += aiReviewMessageCount;
    else
      countsByArticle.set(row.articleId, {
        annotationCount: 0,
        thoughtCount: 0,
        discussionCommentCount: 0,
        aiCommentCount: aiReviewMessageCount,
        distillationCount: 0,
      });
  }

  return countsByArticle;
}

export function readArticleActivityDates(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
) {
  const annotationRows = measureStoreRead(profile, 'read_annotation_activity_dates', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        createdAt: schema.annotations.createdAt,
        updatedAt: schema.annotations.updatedAt,
        distillationStatus: schema.annotations.distillationStatus,
        distillationPublishedAt: schema.annotations.distillationPublishedAt,
        distillationUpdatedAt: schema.annotations.distillationUpdatedAt,
      })
      .from(schema.annotations)
      .all(),
  );
  const commentRows = measureStoreRead(profile, 'read_comment_activity_dates', () =>
    database
      .select({
        articleId: schema.annotations.articleId,
        annotationId: schema.comments.annotationId,
        author: schema.comments.author,
        createdAt: schema.comments.createdAt,
        replyTo: schema.comments.replyTo,
        annotationAuthor: schema.annotations.author,
        annotationCreatedAt: schema.annotations.createdAt,
      })
      .from(schema.comments)
      .innerJoin(schema.annotations, eq(schema.comments.annotationId, schema.annotations.id))
      .all(),
  );
  const distillationReviewRows = measureStoreRead(
    profile,
    'read_distillation_review_activity_dates',
    () =>
      database
        .select({
          articleId: schema.annotations.articleId,
          reviewSessions: schema.annotations.distillationReviewSessions,
        })
        .from(schema.annotations)
        .where(isNotNull(schema.annotations.distillationReviewSessions))
        .all(),
  );
  const datesByArticle = new Map<string, ArticleActivityDates>();
  const articleDates = (articleId: string) => {
    const existing = datesByArticle.get(articleId);
    if (existing) return existing;
    const dates: ArticleActivityDates = {
      annotations: [],
      thoughts: [],
      discussionComments: [],
      aiComments: [],
      distillations: [],
    };
    datesByArticle.set(articleId, dates);
    return dates;
  };

  for (const row of annotationRows) {
    const dates = articleDates(row.articleId);
    dates.annotations.push(row.createdAt);
    if (row.distillationStatus === 'published') {
      dates.distillations.push(
        row.distillationPublishedAt || row.distillationUpdatedAt || row.updatedAt || row.createdAt,
      );
    }
  }

  const annotationsWithPrimaryComment = new Set<string>();
  for (const row of commentRows) {
    const dates = articleDates(row.articleId);
    if (!row.replyTo) dates.thoughts.push(row.createdAt);
    if (row.author === 'ai') dates.aiComments.push(row.createdAt);
    const isPrimaryComment =
      row.author === row.annotationAuthor && row.createdAt === row.annotationCreatedAt;
    if (isPrimaryComment && !annotationsWithPrimaryComment.has(row.annotationId)) {
      annotationsWithPrimaryComment.add(row.annotationId);
      continue;
    }
    dates.discussionComments.push(row.createdAt);
  }

  for (const row of distillationReviewRows) {
    articleDates(row.articleId).aiComments.push(
      ...aiDistillationReviewMessageDates(row.reviewSessions),
    );
  }

  return datesByArticle;
}

function aiDistillationReviewMessageDates(sessions: unknown): string[] {
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap(aiDistillationReviewSessionMessageDates);
}

function aiDistillationReviewSessionMessageDates(session: unknown): string[] {
  if (!session || typeof session !== 'object') return [];
  const messages = (session as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((message: unknown) => {
    if (!message || typeof message !== 'object') return [];
    const { author, createdAt } = message as { author?: unknown; createdAt?: unknown };
    if (author !== 'ai') return [];
    return [typeof createdAt === 'string' ? createdAt : ''];
  });
}

function andConditions(...conditions: Array<SQL | undefined>) {
  return conditions.filter(isSqlCondition).reduce<SQL | undefined>((current, condition) => {
    if (!current) return condition;
    return and(current, condition);
  }, undefined);
}

function isSqlCondition(condition: SQL | undefined): condition is SQL {
  return Boolean(condition);
}
