import type { Annotation, ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import { annotationThoughtComments, annotationThreadComments } from '@yomitomo/core';
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
  rowToText,
  rowToTextSummary,
  type ArticleSummaryRow,
} from './store-normalizers-sources';

type ArticleRow = typeof schema.articles.$inferSelect;
export type { ArticleSummaryRow };
type ArticleBaseRow = ArticleSummaryRow &
  Partial<Pick<ArticleRow, 'siteIconUrl' | 'leadImageUrl' | 'readerChatState'>>;
type NormalizedArticleRowBase = Omit<
  ArticleRecord,
  'sourceType' | 'ebook' | 'pdf' | 'text' | 'contentHtml' | 'focusCoReadingPlan'
>;

export type ArticleSummaryCounts = {
  annotationCount: number;
  thoughtCount: number;
  discussionCommentCount: number;
  aiCommentCount: number;
  distillationCount: number;
};

export function rowToArticle(row: ArticleRow, annotations: Annotation[]): ArticleRecord {
  const base = {
    ...rowToArticleBase(row, annotations),
    contentHtml: row.contentHtml || undefined,
    focusCoReadingPlan: normalizeFocusCoReadingPlan(row.focusCoReadingPlan),
  };
  const sourceType = normalizeArticleSourceType(row.sourceType);

  switch (sourceType) {
    case 'web':
      return { ...base, sourceType };
    case 'ebook': {
      const ebook = rowToEbook(row);
      return ebook ? { ...base, sourceType, ebook } : { ...base, sourceType: 'web' };
    }
    case 'pdf': {
      const pdf = rowToPdf(row);
      return pdf ? { ...base, sourceType, pdf } : { ...base, sourceType: 'web' };
    }
    case 'text': {
      const text = rowToText(row);
      return text ? { ...base, sourceType, text } : { ...base, sourceType: 'web' };
    }
  }
}

export function rowToArticleSummary(
  row: ArticleSummaryRow,
  annotations: Annotation[],
  counts?: ArticleSummaryCounts,
): ArticleSummaryRecord {
  const { readerChatState: _readerChatState, ...base } = rowToArticleBase(row, annotations, counts);
  const sourceType = normalizeArticleSourceType(row.sourceType);

  switch (sourceType) {
    case 'web':
      return { ...base, sourceType };
    case 'ebook': {
      const ebook = rowToEbookSummary(row);
      return ebook ? { ...base, sourceType, ebook } : { ...base, sourceType: 'web' };
    }
    case 'pdf': {
      const pdf = rowToPdfSummary(row);
      return pdf ? { ...base, sourceType, pdf } : { ...base, sourceType: 'web' };
    }
    case 'text': {
      const text = rowToTextSummary(row);
      return text ? { ...base, sourceType, text } : { ...base, sourceType: 'web' };
    }
  }
}

function rowToArticleBase(
  row: ArticleBaseRow,
  annotations: Annotation[],
  counts = articleCountsFromAnnotations(annotations),
): NormalizedArticleRowBase {
  return {
    id: row.id,
    url: row.url,
    canonicalUrl: row.canonicalUrl,
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
    thoughtCount: counts.thoughtCount,
    discussionCommentCount: counts.discussionCommentCount,
    aiCommentCount: counts.aiCommentCount,
    distillationCount: counts.distillationCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function articleCountsFromAnnotations(annotations: Annotation[]): ArticleSummaryCounts {
  return {
    annotationCount: annotations.length,
    thoughtCount: annotations.reduce(
      (count, annotation) => count + annotationThoughtComments(annotation).length,
      0,
    ),
    discussionCommentCount: annotations.reduce(
      (count, annotation) => count + annotationThreadComments(annotation).length,
      0,
    ),
    aiCommentCount: annotations.reduce((count, annotation) => {
      const commentIds = new Set<string>();
      let aiCount = 0;
      for (const comment of annotation.comments) {
        if (comment.author !== 'ai' || commentIds.has(comment.id)) continue;
        commentIds.add(comment.id);
        aiCount += 1;
      }
      for (const session of annotation.distillation?.reviewSessions || []) {
        aiCount += session.messages.filter((message) => message.author === 'ai').length;
      }
      return count + aiCount;
    }, 0),
    distillationCount: annotations.filter(
      (annotation) => annotation.distillation?.status === 'published',
    ).length,
  };
}
