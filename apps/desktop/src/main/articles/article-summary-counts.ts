import { and, count, eq, inArray, isNotNull, sql, type SQL } from 'drizzle-orm';
import type { ArticleSummaryCounts } from '../store/store-normalizers';
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
  if (articleIds.length === 0) return new Map<string, ArticleSummaryCounts>();
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
  const countsByArticle = new Map<string, ArticleSummaryCounts>();

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
    const aiReviewMessageCount = countAiDistillationReviewMessages(row.reviewSessions);
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

function countAiDistillationReviewMessages(sessions: unknown) {
  if (!Array.isArray(sessions)) return 0;
  return sessions.reduce(
    (total, session) => total + countAiDistillationReviewSessionMessages(session),
    0,
  );
}

function countAiDistillationReviewSessionMessages(session: unknown) {
  if (!session || typeof session !== 'object') return 0;
  const messages = (session as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return 0;
  return messages.filter(
    (message): message is { author: string } =>
      Boolean(message) &&
      typeof message === 'object' &&
      (message as { author?: unknown }).author === 'ai',
  ).length;
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
