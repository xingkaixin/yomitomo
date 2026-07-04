import { desc, eq, inArray, or } from 'drizzle-orm';
import type { ArticleRecord, ArticleSummaryRecord } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { rowToArticle, rowToArticleSummary } from '../store/store-normalizers';
import { readArticleAnnotations } from './article-annotation-hydration';
import {
  articleIdentityColumns,
  articleSummaryColumns,
  type ArticleIdentity,
} from './article-repository-columns';
import { readArticleSummaryCountsForArticles } from './article-summary-counts';

export function readArticleRows(database: StoreDatabase, id: string): ArticleRecord | null {
  const row = database.select().from(schema.articles).where(eq(schema.articles.id, id)).get();
  if (!row) return null;

  return rowToArticle(row, readArticleAnnotations(database, id));
}

export function readArticleSummaryRows(
  database: StoreDatabase,
  id: string,
): ArticleSummaryRecord | null {
  const row = database
    .select(articleSummaryColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, id))
    .get();
  if (!row) return null;

  return rowToArticleSummary(
    row,
    readArticleAnnotations(database, id),
    readArticleSummaryCountsForArticles(database, [id]).get(id),
  );
}

export function findArticleByIdentityRows(
  database: StoreDatabase,
  identity: ArticleIdentity,
): ArticleIdentity | null {
  const idMatch = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(eq(schema.articles.id, identity.id))
    .get();
  if (idMatch) return idMatch;

  const candidates = Array.from(new Set([identity.canonicalUrl, identity.url]));
  const row = database
    .select(articleIdentityColumns)
    .from(schema.articles)
    .where(
      or(
        inArray(schema.articles.canonicalUrl, candidates),
        inArray(schema.articles.url, candidates),
      ),
    )
    .orderBy(desc(schema.articles.updatedAt))
    .get();
  return row ? findArticleInListByIdentity([row], identity) : null;
}

export function findArticleInListByIdentity<T extends ArticleIdentity>(
  articles: T[],
  identity: ArticleIdentity,
): T | null {
  return (
    articles.find((item) => item.id === identity.id) ||
    articles.find(
      (item) =>
        item.canonicalUrl === identity.canonicalUrl ||
        item.url === identity.url ||
        item.url === identity.canonicalUrl ||
        item.canonicalUrl === identity.url,
    ) ||
    null
  );
}

export function readArticleCoverRows(database: StoreDatabase, id: string): string {
  return (
    database
      .select({ leadImageUrl: schema.articles.leadImageUrl })
      .from(schema.articles)
      .where(eq(schema.articles.id, id))
      .get()?.leadImageUrl || ''
  );
}

export function readArticleSiteIconRawRows(database: StoreDatabase, id: string): string {
  return (
    database
      .select({ siteIconUrl: schema.articles.siteIconUrl })
      .from(schema.articles)
      .where(eq(schema.articles.id, id))
      .get()?.siteIconUrl || ''
  );
}

export function updateArticleSiteIconRows(
  database: StoreDatabase,
  id: string,
  siteIconUrl: string,
) {
  database.update(schema.articles).set({ siteIconUrl }).where(eq(schema.articles.id, id)).run();
}
