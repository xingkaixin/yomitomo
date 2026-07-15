import { and, count, desc, eq, isNotNull, sql, type SQL } from 'drizzle-orm';
import type {
  ArticleLibrarySource,
  DistillationLibraryItem,
  DistillationLibraryListInput,
  DistillationLibraryListResult,
} from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;

export function readDistillationLibraryRows(
  database: StoreDatabase,
  rawInput: DistillationLibraryListInput,
): DistillationLibraryListResult {
  const input = normalizeInput(rawInput);
  const filter = distillationFilter(input.query);
  const rows = database
    .select({
      annotationId: schema.annotations.id,
      anchor: schema.annotations.anchor,
      articleByline: schema.articles.byline,
      articleId: schema.articles.id,
      articleTitle: schema.articles.title,
      content: schema.annotations.distillationContent,
      publishedAt: schema.annotations.distillationPublishedAt,
      sourceType: schema.articles.sourceType,
      updatedAt: schema.annotations.distillationUpdatedAt,
      annotationUpdatedAt: schema.annotations.updatedAt,
    })
    .from(schema.annotations)
    .innerJoin(schema.articles, eq(schema.annotations.articleId, schema.articles.id))
    .where(filter)
    .orderBy(
      desc(schema.annotations.distillationUpdatedAt),
      desc(schema.annotations.updatedAt),
      desc(schema.annotations.id),
    )
    .limit(input.pageSize)
    .offset((input.page - 1) * input.pageSize)
    .all();
  const totalCount = countDistillations(database, filter);
  const unfilteredCount = input.query
    ? countDistillations(database, distillationFilter(''))
    : totalCount;

  return {
    items: rows.map(toLibraryItem),
    page: input.page,
    pageSize: input.pageSize,
    query: input.query,
    totalCount,
    unfilteredCount,
  };
}

type NormalizedInput = {
  query: string;
  page: number;
  pageSize: number;
};

function normalizeInput(input: DistillationLibraryListInput): NormalizedInput {
  return {
    query: input.query?.trim() || '',
    page: normalizePositiveInteger(input.page, DEFAULT_PAGE, MAX_PAGE),
    pageSize: normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const integer = Math.floor(value);
  if (integer <= 0) return fallback;
  return Math.min(integer, maximum);
}

function distillationFilter(query: string) {
  return and(
    eq(schema.annotations.distillationStatus, 'published'),
    isNotNull(schema.annotations.distillationContent),
    sql`trim(${schema.annotations.distillationContent}) <> ''`,
    searchCondition(query),
  ) as SQL;
}

function searchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  if (query.length < 3) {
    const pattern = `%${escapeLikePattern(query.toLocaleLowerCase('zh-CN'))}%`;
    return sql`lower(${schema.annotations.distillationContent}) LIKE ${pattern} ESCAPE '\\'`;
  }
  const phrase = `"${query.replaceAll('"', '""')}"`;
  return sql`${schema.annotations.id} IN (
    SELECT annotation_id
    FROM distillation_library_fts
    WHERE distillation_library_fts MATCH ${phrase}
  )`;
}

function escapeLikePattern(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function countDistillations(database: StoreDatabase, filter: SQL) {
  return (
    database.select({ value: count() }).from(schema.annotations).where(filter).get()?.value || 0
  );
}

function toLibraryItem(row: {
  annotationId: string;
  anchor: unknown;
  articleByline: string | null;
  articleId: string;
  articleTitle: string;
  content: string | null;
  publishedAt: string | null;
  sourceType: string;
  updatedAt: string | null;
  annotationUpdatedAt: string;
}): DistillationLibraryItem {
  return {
    annotationId: row.annotationId,
    articleId: row.articleId,
    articleTitle: row.articleTitle,
    ...(row.articleByline ? { articleByline: row.articleByline } : {}),
    sourceType: normalizeArticleSource(row.sourceType),
    anchorText: anchorExactText(row.anchor),
    content: row.content || '',
    ...(row.publishedAt ? { publishedAt: row.publishedAt } : {}),
    updatedAt: row.updatedAt || row.annotationUpdatedAt,
  };
}

function normalizeArticleSource(value: string): ArticleLibrarySource {
  if (value === 'ebook' || value === 'pdf' || value === 'text') return value;
  return 'web';
}

function anchorExactText(anchor: unknown) {
  if (typeof anchor !== 'object' || anchor === null || Array.isArray(anchor)) return '';
  const exact = (anchor as Record<string, unknown>).exact;
  return typeof exact === 'string' ? exact : '';
}
