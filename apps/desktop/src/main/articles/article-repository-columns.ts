import type { ArticleRecord } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { ArticleSummaryRow } from '../store/store-normalizers';

export type ArticleIdentity = Pick<ArticleRecord, 'id' | 'url' | 'canonicalUrl'>;

export const articleSummaryColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
  sourceType: schema.articles.sourceType,
  title: schema.articles.title,
  byline: schema.articles.byline,
  excerpt: schema.articles.excerpt,
  siteName: schema.articles.siteName,
  themeColor: schema.articles.themeColor,
  contentHash: schema.articles.contentHash,
  ebookMetadata: schema.articles.ebookMetadata,
  pdfMetadata: schema.articles.pdfMetadata,
  textMetadata: schema.articles.textMetadata,
  readingProgress: schema.articles.readingProgress,
  createdAt: schema.articles.createdAt,
  updatedAt: schema.articles.updatedAt,
} satisfies Record<keyof ArticleSummaryRow, unknown>;

export const articleIdentityColumns = {
  id: schema.articles.id,
  url: schema.articles.url,
  canonicalUrl: schema.articles.canonicalUrl,
};
