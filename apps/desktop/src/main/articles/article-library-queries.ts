import { and, asc, count, desc, eq, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
import type {
  ArticleLibraryListInput,
  ArticleLibraryListResult,
  ArticleLibrarySource,
  ArticleLibrarySourceCounts,
} from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreReadProfileEntry } from '../store/store-db';
import { measureStoreRead } from '../store/store-read-profile';
import { rowToArticleSummary } from '../store/store-normalizers';
import { articleSummaryColumns } from './article-repository-columns';
import { readArticleSummaryCountsForArticles } from './article-summary-counts';

const DEFAULT_LIBRARY_PAGE = 1;
const DEFAULT_LIBRARY_PAGE_SIZE = 12;
const MAX_LIBRARY_PAGE_SIZE = 100;

export function readArticleLibraryListRows(
  database: StoreDatabase,
  input: ArticleLibraryListInput,
  profile?: StoreReadProfileEntry[],
): ArticleLibraryListResult {
  const source = normalizeArticleLibrarySource(input.source);
  const pageSize = normalizeArticleLibraryPageSize(input.pageSize);
  const page = normalizeArticleLibraryPage(input.page);
  const query = input.query?.trim() || '';
  const where = articleLibraryWhere(source, query);
  const offset = (page - 1) * pageSize;
  const rows = measureStoreRead(
    profile,
    'read_article_library_page',
    () =>
      database
        .select(articleSummaryColumns)
        .from(schema.articles)
        .where(where)
        .orderBy(
          desc(schema.articles.createdAt),
          desc(schema.articles.updatedAt),
          asc(schema.articles.title),
        )
        .limit(pageSize)
        .offset(offset)
        .all(),
    { page, pageSize },
  );
  const totalCount = measureStoreRead(
    profile,
    'count_article_library_page',
    () => database.select({ count: count() }).from(schema.articles).where(where).get()?.count || 0,
  );
  const sourceCounts = readArticleLibrarySourceCounts(database, profile);
  const articleCounts = readArticleSummaryCountsForArticles(
    database,
    rows.map((row) => row.id),
    profile,
  );

  return {
    articles: rows.map((row) => rowToArticleSummary(row, [], articleCounts.get(row.id))),
    page,
    pageSize,
    query,
    source,
    sourceCounts,
    totalCount,
  };
}

function readArticleLibrarySourceCounts(
  database: StoreDatabase,
  profile?: StoreReadProfileEntry[],
): ArticleLibrarySourceCounts {
  const counts: ArticleLibrarySourceCounts = { web: 0, ebook: 0, pdf: 0, text: 0 };
  const rows = measureStoreRead(profile, 'count_article_library_sources', () =>
    database
      .select({ sourceType: schema.articles.sourceType, count: count() })
      .from(schema.articles)
      .groupBy(schema.articles.sourceType)
      .all(),
  );
  for (const row of rows) {
    counts[normalizeArticleLibrarySource(row.sourceType)] += row.count || 0;
  }
  return counts;
}

function articleLibraryWhere(source: ArticleLibrarySource, query: string) {
  return andConditions(
    eq(schema.articles.sourceType, source),
    articleLibrarySearchCondition(query),
  );
}

function articleLibrarySearchCondition(query: string): SQL | undefined {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return undefined;
  const pattern = `%${escapeSqlLikePattern(normalizedQuery)}%`;
  return or(
    articleTextLike(schema.articles.title, pattern),
    articleTextLike(schema.articles.byline, pattern),
    articleTextLike(schema.articles.siteName, pattern),
    articleTextLike(schema.articles.excerpt, pattern),
    articleTextLike(schema.articles.url, pattern),
    articleTextLike(schema.articles.canonicalUrl, pattern),
    articleTextLike(schema.articles.ebookMetadata, pattern),
    articleTextLike(schema.articles.pdfMetadata, pattern),
  );
}

function articleTextLike(column: AnyColumn, pattern: string) {
  return sql`lower(coalesce(${column}, '')) like ${pattern} escape '\\'`;
}

function escapeSqlLikePattern(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function normalizeArticleLibrarySource(value: unknown): ArticleLibrarySource {
  if (value === 'ebook' || value === 'pdf' || value === 'text') return value;
  return 'web';
}

function normalizeArticleLibraryPage(value: unknown) {
  const page = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  return page > 0 ? page : DEFAULT_LIBRARY_PAGE;
}

function normalizeArticleLibraryPageSize(value: unknown) {
  const pageSize = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
  if (pageSize <= 0) return DEFAULT_LIBRARY_PAGE_SIZE;
  return Math.min(pageSize, MAX_LIBRARY_PAGE_SIZE);
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
