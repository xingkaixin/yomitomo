import type { Annotation, ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import * as schema from '../db/schema';
import { normalizeReaderChatState } from './store-normalizers-reader-chat';
import {
  normalizeArticleReadingProgress,
  normalizeArticleSourceType,
  normalizeFocusCoReadingPlan,
  rowToEbook,
  rowToEbookSummary,
  rowToPdf,
  rowToPdfSummary,
  type ArticleSummaryRow,
} from './store-normalizers-sources';

type ArticleRow = typeof schema.articles.$inferSelect;
export type { ArticleSummaryRow };
type ArticleBaseRow = ArticleSummaryRow &
  Partial<Pick<ArticleRow, 'siteIconUrl' | 'leadImageUrl' | 'readerChatState'>>;

export type ArticleSummaryCounts = {
  annotationCount: number;
  commentCount: number;
  distillationCount: number;
};

export function rowToArticle(row: ArticleRow, annotations: Annotation[]): ArticleRecord {
  return {
    ...rowToArticleBase(row, annotations),
    contentHtml: row.contentHtml || undefined,
    ebook: rowToEbook(row),
    pdf: rowToPdf(row),
    focusCoReadingPlan: normalizeFocusCoReadingPlan(row.focusCoReadingPlan),
  };
}

export function rowToArticleSummary(
  row: ArticleSummaryRow,
  annotations: Annotation[],
  counts?: ArticleSummaryCounts,
): ArticleSummaryRecord {
  const { readerChatState: _readerChatState, ...base } = rowToArticleBase(row, annotations, counts);
  return {
    ...base,
    ebook: rowToEbookSummary(row),
    pdf: rowToPdfSummary(row),
  };
}

function rowToArticleBase(
  row: ArticleBaseRow,
  annotations: Annotation[],
  counts = articleCountsFromAnnotations(annotations),
): ArticleRecord {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
    sourceType: normalizeArticleSourceType(row.sourceType),
    title: row.title,
    byline: row.byline || undefined,
    excerpt: row.excerpt || undefined,
    siteName: row.siteName || undefined,
    siteIconUrl: row.siteIconUrl || undefined,
    leadImageUrl: row.leadImageUrl || undefined,
    themeColor: row.themeColor || undefined,
    contentHash: row.contentHash,
    readingProgress: normalizeArticleReadingProgress(row.readingProgress),
    readerChatState: normalizeReaderChatState(row.readerChatState, row.id),
    annotations,
    annotationCount: counts.annotationCount,
    commentCount: counts.commentCount,
    distillationCount: counts.distillationCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function articleCountsFromAnnotations(annotations: Annotation[]): ArticleSummaryCounts {
  return {
    annotationCount: annotations.length,
    commentCount: annotations.reduce(
      (count, annotation) =>
        count + annotation.comments.filter((comment) => !comment.replyTo).length,
      0,
    ),
    distillationCount: annotations.filter(
      (annotation) => annotation.distillation?.status === 'published',
    ).length,
  };
}
