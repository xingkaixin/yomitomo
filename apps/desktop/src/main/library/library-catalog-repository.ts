import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  notExists,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type {
  LibraryCatalogItemCounts,
  LibraryCatalogItemType,
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  LibraryCatalogScope,
  LibraryCatalogType,
} from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { hydrateCatalogCandidates } from './library-catalog-hydration';
import { ARTICLE_CATALOG_TYPES, type CatalogCandidate } from './library-catalog-model';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const ALL_TYPES: LibraryCatalogType[] = ['collection', 'web', 'ebook', 'pdf', 'text', 'weread'];
const memberArticle = alias(schema.articles, 'member_article');
const memberWeReadBook = alias(schema.wereadBooks, 'member_weread_book');

export function readLibraryCatalogRows(
  database: StoreDatabase,
  rawInput: LibraryCatalogListInput,
): LibraryCatalogListResult {
  const input = normalizeInput(rawInput);
  const offset = (input.page - 1) * input.pageSize;
  const candidateLimit = offset + input.pageSize;
  const candidates = readCatalogCandidates(database, input, candidateLimit)
    .toSorted(compareCandidates)
    .slice(offset, candidateLimit);
  const totalCount = countCatalogCandidates(database, input);
  const unfilteredCount = input.query
    ? countCatalogCandidates(database, { ...input, query: '' })
    : totalCount;

  return {
    entities: hydrateCatalogCandidates(database, candidates),
    itemCounts: readItemCounts(database),
    page: input.page,
    pageSize: input.pageSize,
    query: input.query,
    totalCount,
    unfilteredCount,
  };
}

type NormalizedInput = {
  scope: LibraryCatalogScope;
  types: ReadonlySet<LibraryCatalogType>;
  query: string;
  page: number;
  pageSize: number;
};

function normalizeInput(input: LibraryCatalogListInput): NormalizedInput {
  const selectedTypes = (input.types || []).filter(isLibraryCatalogType);
  return {
    scope: normalizeScope(input.scope),
    types: new Set(selectedTypes.length > 0 ? selectedTypes : ALL_TYPES),
    query: input.query?.trim() || '',
    page: normalizePositiveInteger(input.page, DEFAULT_PAGE, MAX_PAGE),
    pageSize: normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function normalizeScope(scope: LibraryCatalogScope): LibraryCatalogScope {
  if (scope?.kind === 'collection' && scope.collectionId) return scope;
  if (scope?.kind === 'picker' && scope.collectionId) return scope;
  return { kind: 'library' };
}

function normalizePositiveInteger(value: unknown, fallback: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const integer = Math.floor(value);
  if (integer <= 0) return fallback;
  return Math.min(integer, maximum);
}

function isLibraryCatalogType(value: unknown): value is LibraryCatalogType {
  return ALL_TYPES.includes(value as LibraryCatalogType);
}

function readCatalogCandidates(database: StoreDatabase, input: NormalizedInput, limit: number) {
  const candidates: CatalogCandidate[] = [];
  for (const source of ARTICLE_CATALOG_TYPES) {
    if (!input.types.has(source)) continue;
    candidates.push(...readArticleCandidates(database, input, source, true, limit));
    candidates.push(...readArticleCandidates(database, input, source, false, limit));
  }
  if (input.types.has('weread')) {
    candidates.push(...readWeReadCandidates(database, input, true, limit));
    candidates.push(...readWeReadCandidates(database, input, false, limit));
  }
  if (showsCollections(input)) {
    candidates.push(...readCollectionCandidates(database, input, true, limit));
    candidates.push(...readCollectionCandidates(database, input, false, limit));
  }
  return candidates;
}

function readArticleCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  source: Exclude<LibraryCatalogItemType, 'weread'>,
  pinned: boolean,
  limit: number,
): CatalogCandidate[] {
  if (input.scope.kind === 'collection') {
    return readCollectionArticleCandidates(
      database,
      input,
      input.scope.collectionId,
      source,
      pinned,
      limit,
    );
  }
  if (pinned) return readPinnedArticleCandidates(database, input, source, limit);
  const sortTime = schema.articles.createdAt;
  return database
    .select({
      id: schema.articles.id,
      sortTime,
      title: schema.articles.title,
    })
    .from(schema.articles)
    .where(
      and(
        eq(schema.articles.sourceType, source),
        articleScopeCondition(database, input),
        articleSearchCondition(schema.articles, input.query),
        pinCondition(database, 'article', schema.articles.id, pinned),
      ),
    )
    .orderBy(desc(sortTime), asc(schema.articles.title), asc(schema.articles.id))
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: source,
      sortTime: row.sortTime,
      title: row.title,
      pinned,
    }));
}

function readPinnedArticleCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  source: Exclude<LibraryCatalogItemType, 'weread'>,
  limit: number,
): CatalogCandidate[] {
  return database
    .select({
      id: schema.articles.id,
      sortTime: schema.articles.createdAt,
      title: schema.articles.title,
    })
    .from(schema.libraryPins)
    .innerJoin(
      schema.articles,
      and(
        eq(schema.libraryPins.targetKind, 'article'),
        eq(schema.libraryPins.targetId, schema.articles.id),
      ),
    )
    .where(
      and(
        eq(schema.articles.sourceType, source),
        articleScopeCondition(database, input),
        articleSearchCondition(schema.articles, input.query),
      ),
    )
    .orderBy(desc(schema.articles.createdAt), asc(schema.articles.title), asc(schema.articles.id))
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: source,
      sortTime: row.sortTime,
      title: row.title,
      pinned: true,
    }));
}

function readCollectionArticleCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  collectionId: string,
  source: Exclude<LibraryCatalogItemType, 'weread'>,
  pinned: boolean,
  limit: number,
): CatalogCandidate[] {
  return database
    .select({
      id: schema.articles.id,
      sortTime: schema.collectionMembers.addedAt,
      title: schema.articles.title,
    })
    .from(schema.collectionMembers)
    .innerJoin(
      schema.articles,
      and(
        eq(schema.collectionMembers.memberKind, 'article'),
        eq(schema.collectionMembers.memberId, schema.articles.id),
      ),
    )
    .where(
      and(
        eq(schema.collectionMembers.collectionId, collectionId),
        eq(schema.articles.sourceType, source),
        articleSearchCondition(schema.articles, input.query),
        pinCondition(database, 'article', schema.articles.id, pinned),
      ),
    )
    .orderBy(
      desc(schema.collectionMembers.addedAt),
      asc(schema.articles.title),
      asc(schema.articles.id),
    )
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: source,
      sortTime: row.sortTime,
      title: row.title,
      pinned,
    }));
}

function readWeReadCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  pinned: boolean,
  limit: number,
): CatalogCandidate[] {
  if (input.scope.kind === 'collection') {
    return readCollectionWeReadCandidates(database, input, input.scope.collectionId, pinned, limit);
  }
  if (pinned) return readPinnedWeReadCandidates(database, input, limit);
  const sortTime = weReadSortTime();
  return database
    .select({
      id: schema.wereadBooks.bookId,
      sortTime,
      title: schema.wereadBooks.title,
    })
    .from(schema.wereadBooks)
    .where(
      and(
        weReadScopeCondition(database, input),
        weReadSearchCondition(schema.wereadBooks, input.query),
        pinCondition(database, 'weread', schema.wereadBooks.bookId, pinned),
      ),
    )
    .orderBy(desc(sortTime), asc(schema.wereadBooks.title), asc(schema.wereadBooks.bookId))
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: 'weread',
      sortTime: row.sortTime,
      title: row.title,
      pinned,
    }));
}

function readPinnedWeReadCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  limit: number,
): CatalogCandidate[] {
  const sortTime = weReadSortTime();
  return database
    .select({
      id: schema.wereadBooks.bookId,
      sortTime,
      title: schema.wereadBooks.title,
    })
    .from(schema.libraryPins)
    .innerJoin(
      schema.wereadBooks,
      and(
        eq(schema.libraryPins.targetKind, 'weread'),
        eq(schema.libraryPins.targetId, schema.wereadBooks.bookId),
      ),
    )
    .where(
      and(
        weReadScopeCondition(database, input),
        weReadSearchCondition(schema.wereadBooks, input.query),
      ),
    )
    .orderBy(desc(sortTime), asc(schema.wereadBooks.title), asc(schema.wereadBooks.bookId))
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: 'weread',
      sortTime: row.sortTime,
      title: row.title,
      pinned: true,
    }));
}

function readCollectionWeReadCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  collectionId: string,
  pinned: boolean,
  limit: number,
): CatalogCandidate[] {
  return database
    .select({
      id: schema.wereadBooks.bookId,
      sortTime: schema.collectionMembers.addedAt,
      title: schema.wereadBooks.title,
    })
    .from(schema.collectionMembers)
    .innerJoin(
      schema.wereadBooks,
      and(
        eq(schema.collectionMembers.memberKind, 'weread'),
        eq(schema.collectionMembers.memberId, schema.wereadBooks.bookId),
      ),
    )
    .where(
      and(
        eq(schema.collectionMembers.collectionId, collectionId),
        weReadSearchCondition(schema.wereadBooks, input.query),
        pinCondition(database, 'weread', schema.wereadBooks.bookId, pinned),
      ),
    )
    .orderBy(
      desc(schema.collectionMembers.addedAt),
      asc(schema.wereadBooks.title),
      asc(schema.wereadBooks.bookId),
    )
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'item',
      id: row.id,
      type: 'weread',
      sortTime: row.sortTime,
      title: row.title,
      pinned,
    }));
}

function readCollectionCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  pinned: boolean,
  limit: number,
): CatalogCandidate[] {
  if (pinned) return readPinnedCollectionCandidates(database, input, limit);
  const memberCount = sql<number>`(
    select count(*)
    from ${schema.collectionMembers}
    where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
  )`.mapWith(Number);
  return database
    .select({
      id: schema.collections.id,
      memberCount,
      sortTime: schema.collections.createdAt,
      title: schema.collections.name,
    })
    .from(schema.collections)
    .where(
      and(
        collectionSearchCondition(database, input.query),
        pinCondition(database, 'collection', schema.collections.id, pinned),
      ),
    )
    .orderBy(
      desc(schema.collections.createdAt),
      asc(schema.collections.name),
      asc(schema.collections.id),
    )
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'collection',
      id: row.id,
      type: 'collection',
      sortTime: row.sortTime,
      title: row.title,
      pinned,
      memberCount: row.memberCount,
    }));
}

function readPinnedCollectionCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  limit: number,
): CatalogCandidate[] {
  const memberCount = sql<number>`(
    select count(*)
    from ${schema.collectionMembers}
    where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
  )`.mapWith(Number);
  return database
    .select({
      id: schema.collections.id,
      memberCount,
      sortTime: schema.collections.createdAt,
      title: schema.collections.name,
    })
    .from(schema.libraryPins)
    .innerJoin(
      schema.collections,
      and(
        eq(schema.libraryPins.targetKind, 'collection'),
        eq(schema.libraryPins.targetId, schema.collections.id),
      ),
    )
    .where(collectionSearchCondition(database, input.query))
    .orderBy(
      desc(schema.collections.createdAt),
      asc(schema.collections.name),
      asc(schema.collections.id),
    )
    .limit(limit)
    .all()
    .map((row) => ({
      kind: 'collection',
      id: row.id,
      type: 'collection',
      sortTime: row.sortTime,
      title: row.title,
      pinned: true,
      memberCount: row.memberCount,
    }));
}

function countCatalogCandidates(database: StoreDatabase, input: NormalizedInput) {
  let total = 0;
  for (const source of ARTICLE_CATALOG_TYPES) {
    if (!input.types.has(source)) continue;
    total += countArticleCandidates(database, input, source);
  }
  if (input.types.has('weread')) {
    total += countWeReadCandidates(database, input);
  }
  if (showsCollections(input)) {
    total +=
      database
        .select({ count: count() })
        .from(schema.collections)
        .where(collectionSearchCondition(database, input.query))
        .get()?.count || 0;
  }
  return total;
}

function countArticleCandidates(
  database: StoreDatabase,
  input: NormalizedInput,
  source: Exclude<LibraryCatalogItemType, 'weread'>,
) {
  if (input.scope.kind === 'collection') {
    return (
      database
        .select({ count: count() })
        .from(schema.collectionMembers)
        .innerJoin(
          schema.articles,
          and(
            eq(schema.collectionMembers.memberKind, 'article'),
            eq(schema.collectionMembers.memberId, schema.articles.id),
          ),
        )
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            eq(schema.articles.sourceType, source),
            articleSearchCondition(schema.articles, input.query),
          ),
        )
        .get()?.count || 0
    );
  }
  return (
    database
      .select({ count: count() })
      .from(schema.articles)
      .where(
        and(
          eq(schema.articles.sourceType, source),
          articleScopeCondition(database, input),
          articleSearchCondition(schema.articles, input.query),
        ),
      )
      .get()?.count || 0
  );
}

function countWeReadCandidates(database: StoreDatabase, input: NormalizedInput) {
  if (input.scope.kind === 'collection') {
    return (
      database
        .select({ count: count() })
        .from(schema.collectionMembers)
        .innerJoin(
          schema.wereadBooks,
          and(
            eq(schema.collectionMembers.memberKind, 'weread'),
            eq(schema.collectionMembers.memberId, schema.wereadBooks.bookId),
          ),
        )
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            weReadSearchCondition(schema.wereadBooks, input.query),
          ),
        )
        .get()?.count || 0
    );
  }
  return (
    database
      .select({ count: count() })
      .from(schema.wereadBooks)
      .where(
        and(
          weReadScopeCondition(database, input),
          weReadSearchCondition(schema.wereadBooks, input.query),
        ),
      )
      .get()?.count || 0
  );
}

function showsCollections(input: NormalizedInput) {
  return input.scope.kind === 'library' && input.types.has('collection');
}

function articleScopeCondition(database: StoreDatabase, input: NormalizedInput): SQL | undefined {
  if (input.scope.kind === 'collection') {
    return exists(
      database
        .select({ value: sql`1` })
        .from(schema.collectionMembers)
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            eq(schema.collectionMembers.memberKind, 'article'),
            eq(schema.collectionMembers.memberId, schema.articles.id),
          ),
        ),
    );
  }
  if (input.scope.kind === 'picker') {
    return notExists(
      database
        .select({ value: sql`1` })
        .from(schema.collectionMembers)
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            eq(schema.collectionMembers.memberKind, 'article'),
            eq(schema.collectionMembers.memberId, schema.articles.id),
          ),
        ),
    );
  }
  if (!showsCollections(input)) return undefined;
  return notExists(
    database
      .select({ value: sql`1` })
      .from(schema.collectionMembers)
      .where(
        and(
          eq(schema.collectionMembers.memberKind, 'article'),
          eq(schema.collectionMembers.memberId, schema.articles.id),
        ),
      ),
  );
}

function weReadScopeCondition(database: StoreDatabase, input: NormalizedInput): SQL | undefined {
  if (input.scope.kind === 'collection') {
    return exists(
      database
        .select({ value: sql`1` })
        .from(schema.collectionMembers)
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            eq(schema.collectionMembers.memberKind, 'weread'),
            eq(schema.collectionMembers.memberId, schema.wereadBooks.bookId),
          ),
        ),
    );
  }
  if (input.scope.kind === 'picker') {
    return notExists(
      database
        .select({ value: sql`1` })
        .from(schema.collectionMembers)
        .where(
          and(
            eq(schema.collectionMembers.collectionId, input.scope.collectionId),
            eq(schema.collectionMembers.memberKind, 'weread'),
            eq(schema.collectionMembers.memberId, schema.wereadBooks.bookId),
          ),
        ),
    );
  }
  if (!showsCollections(input)) return undefined;
  return notExists(
    database
      .select({ value: sql`1` })
      .from(schema.collectionMembers)
      .where(
        and(
          eq(schema.collectionMembers.memberKind, 'weread'),
          eq(schema.collectionMembers.memberId, schema.wereadBooks.bookId),
        ),
      ),
  );
}

function weReadSortTime() {
  return sql<string>`case
    when ${schema.wereadBooks.lastReadAt} > 0 then strftime(
      '%Y-%m-%dT%H:%M:%fZ',
      case
        when ${schema.wereadBooks.lastReadAt} < 1000000000000 then ${schema.wereadBooks.lastReadAt}
        else ${schema.wereadBooks.lastReadAt} / 1000
      end,
      'unixepoch'
    )
    else ${schema.wereadBooks.updatedAt}
  end`;
}

function pinCondition(
  database: StoreDatabase,
  kind: 'article' | 'collection' | 'weread',
  id: AnyColumn,
  pinned: boolean,
) {
  const query = database
    .select({ value: sql`1` })
    .from(schema.libraryPins)
    .where(and(eq(schema.libraryPins.targetKind, kind), eq(schema.libraryPins.targetId, id)));
  return pinned ? exists(query) : notExists(query);
}

function articleSearchCondition(
  table: typeof schema.articles | typeof memberArticle,
  query: string,
): SQL | undefined {
  const pattern = searchPattern(query);
  if (!pattern) return undefined;
  const fallback = or(
    textLike(table.title, pattern),
    textLike(table.byline, pattern),
    textLike(table.siteName, pattern),
    textLike(table.excerpt, pattern),
    textLike(table.url, pattern),
    textLike(table.canonicalUrl, pattern),
    textLike(table.ebookMetadata, pattern),
    textLike(table.pdfMetadata, pattern),
    textLike(table.textMetadata, pattern),
  );
  return indexedSearchCondition('article', table.id, query, fallback);
}

function weReadSearchCondition(
  table: typeof schema.wereadBooks | typeof memberWeReadBook,
  query: string,
): SQL | undefined {
  const pattern = searchPattern(query);
  if (!pattern) return undefined;
  const fallback = or(
    textLike(table.title, pattern),
    textLike(table.author, pattern),
    textLike(table.intro, pattern),
  );
  return indexedSearchCondition('weread', table.bookId, query, fallback);
}

function collectionSearchCondition(database: StoreDatabase, query: string): SQL | undefined {
  const pattern = searchPattern(query);
  if (!pattern) return undefined;
  const ownFallback = or(
    textLike(schema.collections.name, pattern),
    textLike(schema.collections.desc, pattern),
  );
  const memberMatches = database
    .select({ value: sql`1` })
    .from(schema.collectionMembers)
    .leftJoin(
      memberArticle,
      and(
        eq(schema.collectionMembers.memberKind, 'article'),
        eq(schema.collectionMembers.memberId, memberArticle.id),
      ),
    )
    .leftJoin(
      memberWeReadBook,
      and(
        eq(schema.collectionMembers.memberKind, 'weread'),
        eq(schema.collectionMembers.memberId, memberWeReadBook.bookId),
      ),
    )
    .where(
      and(
        eq(schema.collectionMembers.collectionId, schema.collections.id),
        or(
          articleSearchCondition(memberArticle, query),
          weReadSearchCondition(memberWeReadBook, query),
        ),
      ),
    );
  return or(
    indexedSearchCondition('collection', schema.collections.id, query, ownFallback),
    exists(memberMatches),
  );
}

function indexedSearchCondition(
  kind: string,
  id: AnyColumn,
  query: string,
  fallback: SQL | undefined,
) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (normalized.length < 3) return fallback;
  const matchQuery = `"${normalized.replaceAll('"', '""')}"`;
  return sql`${id} in (
    select id
    from library_catalog_fts
    where kind = ${kind} and library_catalog_fts match ${matchQuery}
  )`;
}

function searchPattern(query: string) {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return normalized ? `%${normalized.replace(/[\\%_]/g, (char) => `\\${char}`)}%` : '';
}

function textLike(column: AnyColumn, pattern: string) {
  return sql`lower(coalesce(${column}, '')) like ${pattern} escape '\\'`;
}

function readItemCounts(database: StoreDatabase): LibraryCatalogItemCounts {
  const counts: LibraryCatalogItemCounts = { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 };
  const articleCounts = database
    .select({ source: schema.articles.sourceType, count: count() })
    .from(schema.articles)
    .groupBy(schema.articles.sourceType)
    .all();
  for (const row of articleCounts) {
    const source = ARTICLE_CATALOG_TYPES.includes(
      row.source as Exclude<LibraryCatalogItemType, 'weread'>,
    )
      ? (row.source as Exclude<LibraryCatalogItemType, 'weread'>)
      : 'web';
    counts[source] += row.count || 0;
  }
  counts.weread = database.select({ count: count() }).from(schema.wereadBooks).get()?.count || 0;
  return counts;
}

function compareCandidates(left: CatalogCandidate, right: CatalogCandidate) {
  return (
    Number(right.pinned) - Number(left.pinned) ||
    timestampValue(right.sortTime) - timestampValue(left.sortTime) ||
    left.title.localeCompare(right.title, 'zh-CN') ||
    left.id.localeCompare(right.id)
  );
}

function timestampValue(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
