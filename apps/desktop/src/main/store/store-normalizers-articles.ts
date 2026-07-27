import type { Annotation, ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import { articleCounts } from '@yomitomo/core';
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
  counts = articleCounts({ annotations: [] }),
): ArticleSummaryRecord {
  const {
    annotations: _annotations,
    readerChatState: _readerChatState,
    ...base
  } = rowToArticleBase(row, []);
  const sourceType = normalizeArticleSourceType(row.sourceType);
  const summaryBase = { ...base, annotations: [] as [], counts };

  switch (sourceType) {
    case 'web':
      return { ...summaryBase, sourceType };
    case 'ebook': {
      const ebook = rowToEbookSummary(row);
      return ebook ? { ...summaryBase, sourceType, ebook } : { ...summaryBase, sourceType: 'web' };
    }
    case 'pdf': {
      const pdf = rowToPdfSummary(row);
      return pdf ? { ...summaryBase, sourceType, pdf } : { ...summaryBase, sourceType: 'web' };
    }
    case 'text': {
      const text = rowToTextSummary(row);
      return text ? { ...summaryBase, sourceType, text } : { ...summaryBase, sourceType: 'web' };
    }
  }
}

function rowToArticleBase(
  row: ArticleBaseRow,
  annotations: Annotation[],
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
