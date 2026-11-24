import {
  and,
  eq,
  exists,
  inArray,
  notExists,
  or,
  sql,
  type AnyColumn,
  type SQL,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { ARTICLE_SOURCE_TYPES, normalizeArticleSourceType } from '@yomitomo/shared';
import type {
  LibraryCatalogItemCounts,
  LibraryCatalogItemType,
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  LibraryCatalogScope,
  LibraryCatalogSort,
  LibraryCatalogStatusFilter,
  LibraryCatalogType,
} from '../../ipc-contract';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { hydrateCatalogCandidates } from './library-catalog-hydration';
import type { CatalogCandidate } from './library-catalog-model';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE = 10_000;
const MAX_PAGE_SIZE = 100;
const ALL_TYPES: LibraryCatalogType[] = ['collection', ...ARTICLE_SOURCE_TYPES, 'weread'];
const ALL_SORTS = new Set<LibraryCatalogSort>(['recent', 'title', 'progress', 'annotations']);
const ALL_STATUSES = new Set<LibraryCatalogStatusFilter>([
  'all',
  'unread',
  'reading',
  'completed',
  'annotated',
]);
const COMPLETED_PROGRESS_THRESHOLD = 0.99;
const memberArticle = alias(schema.articles, 'member_article');
const memberWeReadBook = alias(schema.wereadBooks, 'member_weread_book');

export function readLibraryCatalogRows(
  database: StoreDatabase,
  rawInput: LibraryCatalogListInput,
): LibraryCatalogListResult {
  const input = normalizeInput(rawInput);
  const offset = (input.page - 1) * input.pageSize;
  const itemCounts = readItemCounts(database);
  const tableCounts = readAuxTableCounts(database);
  const unfilteredCount = readUnfilteredCount(database, input, itemCounts, tableCounts);
  const page = canUseRecentTopKFastPath(input, offset)
    ? readRecentCatalogPageFast(
        database,
        input,
        offset,
        input.pageSize,
        unfilteredCount,
        itemCounts,
        tableCounts,
      )
    : readCatalogPage(
        database,
        input,
        offset,
        input.pageSize,
        unfilteredCount,
        itemCounts,
        tableCounts,
      );

  return {
    entities: hydrateCatalogCandidates(database, page.candidates),
    itemCounts,
    page: input.page,
    pageSize: input.pageSize,
    query: input.query,
    totalCount: page.totalCount,
    unfilteredCount,
  };
}

type AuxTableCounts = {
  collections: number;
  collectionMembers: number;
  pins: number;
};

function readAuxTableCounts(database: StoreDatabase): AuxTableCounts {
  const row = database.get<AuxTableCounts>(sql`
    select
      (select count(*) from ${schema.collections}) as collections,
      (select count(*) from ${schema.collectionMembers}) as collectionMembers,
      (select count(*) from ${schema.libraryPins}) as pins
  `);
  return {
    collections: row?.collections || 0,
    collectionMembers: row?.collectionMembers || 0,
    pins: row?.pins || 0,
  };
}

type NormalizedInput = {
  scope: LibraryCatalogScope;
  types: ReadonlySet<LibraryCatalogType>;
  articleSources: Exclude<LibraryCatalogItemType, 'weread'>[];
  query: string;
  sort: LibraryCatalogSort;
  status: LibraryCatalogStatusFilter;
  page: number;
  pageSize: number;
};

function normalizeInput(input: LibraryCatalogListInput): NormalizedInput {
  const selectedTypes = (input.types || []).filter(isLibraryCatalogType);
  const types = new Set(selectedTypes.length > 0 ? selectedTypes : ALL_TYPES);
  return {
    scope: normalizeScope(input.scope),
    types,
    articleSources: ARTICLE_SOURCE_TYPES.filter((source) => types.has(source)),
    query: input.query?.trim() || '',
    sort: normalizeSort(input.sort),
    status: normalizeStatus(input.status),
    page: normalizePositiveInteger(input.page, DEFAULT_PAGE, MAX_PAGE),
    pageSize: normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  };
}

function normalizeSort(value: unknown): LibraryCatalogSort {
  return ALL_SORTS.has(value as LibraryCatalogSort) ? (value as LibraryCatalogSort) : 'recent';
}

function normalizeStatus(value: unknown): LibraryCatalogStatusFilter {
  return ALL_STATUSES.has(value as LibraryCatalogStatusFilter)
    ? (value as LibraryCatalogStatusFilter)
    : 'all';
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

function canUseRecentTopKFastPath(input: NormalizedInput, offset: number) {
  return (
    input.query === '' &&
    input.status === 'all' &&
    input.sort === 'recent' &&
    input.scope.kind !== 'collection' &&
    offset + input.pageSize <= 1000
  );
}

function readUnfilteredCount(
  database: StoreDatabase,
  input: NormalizedInput,
  itemCounts: LibraryCatalogItemCounts,
  tableCounts: AuxTableCounts,
): number {
  const includeCollections = showsCollections(input);
  const includeWeRead = input.types.has('weread') && itemCounts.weread > 0;
  const articleSources = input.articleSources;

  if (input.scope.kind === 'collection') {
    if (tableCounts.collectionMembers === 0) return 0;
    const collectionId = input.scope.collectionId;
    let total = 0;
    if (articleSources.length > 0) {
      const sourceCondition = articleSourceFilter(articleSources);
      const row = database.get<{ count: number }>(sql`
        select count(*) as count
        from ${schema.collectionMembers}
        inner join ${schema.articles}
          on ${schema.collectionMembers.memberKind} = ${'article'}
          and ${schema.collectionMembers.memberId} = ${schema.articles.id}
        where ${and(eq(schema.collectionMembers.collectionId, collectionId), sourceCondition)}
      `);
      total += row?.count || 0;
    }
    if (includeWeRead) {
      const row = database.get<{ count: number }>(sql`
        select count(*) as count
        from ${schema.collectionMembers}
        inner join ${schema.wereadBooks}
          on ${schema.collectionMembers.memberKind} = ${'weread'}
          and ${schema.collectionMembers.memberId} = ${schema.wereadBooks.bookId}
        where ${eq(schema.collectionMembers.collectionId, collectionId)}
      `);
      total += row?.count || 0;
    }
    return total;
  }

  let total = 0;
  for (const source of articleSources) total += itemCounts[source];
  if (includeWeRead) total += itemCounts.weread;

  if (input.scope.kind === 'picker') {
    if (tableCounts.collectionMembers === 0) return total;
    const collectionId = input.scope.collectionId;
    if (articleSources.length > 0) {
      const sourceCondition = articleSourceFilter(articleSources);
      const row = database.get<{ count: number }>(sql`
        select count(distinct ${schema.collectionMembers.memberId}) as count
        from ${schema.collectionMembers}
        inner join ${schema.articles}
          on ${schema.collectionMembers.memberKind} = ${'article'}
          and ${schema.collectionMembers.memberId} = ${schema.articles.id}
        where ${and(eq(schema.collectionMembers.collectionId, collectionId), sourceCondition)}
      `);
      total -= row?.count || 0;
    }
    if (includeWeRead) {
      const row = database.get<{ count: number }>(sql`
        select count(distinct ${schema.collectionMembers.memberId}) as count
        from ${schema.collectionMembers}
        inner join ${schema.wereadBooks}
          on ${schema.collectionMembers.memberKind} = ${'weread'}
          and ${schema.collectionMembers.memberId} = ${schema.wereadBooks.bookId}
        where ${eq(schema.collectionMembers.collectionId, collectionId)}
      `);
      total -= row?.count || 0;
    }
    return Math.max(0, total);
  }

  if (!includeCollections) return total;

  total += tableCounts.collections;
  if (tableCounts.collectionMembers === 0) return total;

  if (articleSources.length > 0) {
    const sourceCondition = articleSourceFilter(articleSources);
    const row = database.get<{ count: number }>(sql`
      select count(distinct ${schema.collectionMembers.memberId}) as count
      from ${schema.collectionMembers}
      inner join ${schema.articles}
        on ${schema.collectionMembers.memberKind} = ${'article'}
        and ${schema.collectionMembers.memberId} = ${schema.articles.id}
      where ${requiredCondition(sourceCondition)}
    `);
    total -= row?.count || 0;
  }
  if (includeWeRead) {
    const row = database.get<{ count: number }>(sql`
      select count(distinct ${schema.collectionMembers.memberId}) as count
      from ${schema.collectionMembers}
      inner join ${schema.wereadBooks}
        on ${schema.collectionMembers.memberKind} = ${'weread'}
        and ${schema.collectionMembers.memberId} = ${schema.wereadBooks.bookId}
    `);
    total -= row?.count || 0;
  }
  return Math.max(0, total);
}

type FastCandidateRow = {
  kind: CatalogCandidate['kind'];
  id: string;
  type: LibraryCatalogType;
  sortTime: string;
  title: string;
  pinned: number;
  memberCount: number | null;
};

function readRecentCatalogPageFast(
  database: StoreDatabase,
  input: NormalizedInput,
  offset: number,
  limit: number,
  totalCount: number,
  itemCounts: LibraryCatalogItemCounts,
  tableCounts: AuxTableCounts,
) {
  if (totalCount === 0 || offset >= totalCount) {
    return { candidates: [] as CatalogCandidate[], totalCount };
  }
  const need = offset + limit;
  const rows: FastCandidateRow[] = [];
  const hasPins = tableCounts.pins > 0;
  const hasMembers = tableCounts.collectionMembers > 0;
  const hasWeRead = input.types.has('weread') && itemCounts.weread > 0;
  const hasCollections = showsCollections(input) && tableCounts.collections > 0;
  const hasArticles = input.articleSources.some((source) => itemCounts[source] > 0);

  let pinnedCount = 0;
  if (hasPins) {
    const pinnedSelects: SQL[] = [];
    if (hasArticles) {
      const articleScope = hasMembers ? articleScopeCondition(database, input) : undefined;
      const sourceCondition = articleSourceFilter(input.articleSources);
      pinnedSelects.push(sql`
        select
          ${'item'} as kind,
          ${schema.articles.id} as id,
          ${schema.articles.sourceType} as type,
          ${schema.articles.updatedAt} as sortTime,
          ${articleDisplayTitleSql()} as title,
          1 as pinned,
          null as memberCount
        from ${schema.libraryPins}
        inner join ${schema.articles}
          on ${schema.libraryPins.targetKind} = ${'article'}
          and ${schema.libraryPins.targetId} = ${schema.articles.id}
        where ${requiredCondition(and(sourceCondition, articleScope))}
      `);
    }
    if (hasWeRead) {
      const weReadScope = hasMembers ? weReadScopeCondition(database, input) : undefined;
      pinnedSelects.push(sql`
        select
          ${'item'} as kind,
          ${schema.wereadBooks.bookId} as id,
          ${'weread'} as type,
          ${weReadSortTime()} as sortTime,
          ${schema.wereadBooks.title} as title,
          1 as pinned,
          null as memberCount
        from ${schema.libraryPins}
        inner join ${schema.wereadBooks}
          on ${schema.libraryPins.targetKind} = ${'weread'}
          and ${schema.libraryPins.targetId} = ${schema.wereadBooks.bookId}
        where ${requiredCondition(weReadScope)}
      `);
    }
    if (hasCollections) {
      pinnedSelects.push(sql`
        select
          ${'collection'} as kind,
          ${schema.collections.id} as id,
          ${'collection'} as type,
          ${schema.collections.updatedAt} as sortTime,
          ${schema.collections.name} as title,
          1 as pinned,
          (
            select count(*)
            from ${schema.collectionMembers}
            where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
          ) as memberCount
        from ${schema.libraryPins}
        inner join ${schema.collections}
          on ${schema.libraryPins.targetKind} = ${'collection'}
          and ${schema.libraryPins.targetId} = ${schema.collections.id}
      `);
    }

    if (pinnedSelects.length > 0) {
      const pinnedUnion = sql.join(pinnedSelects, sql` union all `);
      const pinnedRows = database.all<FastCandidateRow>(sql`
        select kind, id, type, sortTime, title, pinned, memberCount
        from (${pinnedUnion})
        order by sortTime desc, title collate nocase asc, id asc
        limit ${need}
      `);
      pinnedCount = pinnedRows.length;
      rows.push(...pinnedRows);
    }
  }

  const remaining = need - pinnedCount;
  if (remaining > 0) {
    const unpinnedRows: FastCandidateRow[] = [];

    if (hasArticles) {
      const articleScope = hasMembers ? articleScopeCondition(database, input) : undefined;
      const sourceCondition = articleSourceFilter(input.articleSources);
      const notPinned = hasPins
        ? notExists(
            database
              .select({ value: sql`1` })
              .from(schema.libraryPins)
              .where(
                and(
                  eq(schema.libraryPins.targetKind, 'article'),
                  eq(schema.libraryPins.targetId, schema.articles.id),
                ),
              ),
          )
        : undefined;
      const whereClause = requiredCondition(and(sourceCondition, articleScope, notPinned));
      // Fetch remaining + 1 in updated_at DESC index order; only pull tie rows if the boundary ties.
      const articleRows = database.all<FastCandidateRow>(sql`
        select
          ${'item'} as kind,
          ${schema.articles.id} as id,
          ${schema.articles.sourceType} as type,
          ${schema.articles.updatedAt} as sortTime,
          ${articleDisplayTitleSql()} as title,
          0 as pinned,
          null as memberCount
        from ${schema.articles}
        where ${whereClause}
        order by ${schema.articles.updatedAt} desc
        limit ${remaining + 1}
      `);
      if (
        articleRows.length > remaining &&
        articleRows[remaining - 1].sortTime === articleRows[remaining].sortTime
      ) {
        const boundaryTime = articleRows[remaining - 1].sortTime;
        const strictlyNewer = articleRows.filter((row) => row.sortTime > boundaryTime);
        const tiedRows = database.all<FastCandidateRow>(sql`
          select
            ${'item'} as kind,
            ${schema.articles.id} as id,
            ${schema.articles.sourceType} as type,
            ${schema.articles.updatedAt} as sortTime,
            ${articleDisplayTitleSql()} as title,
            0 as pinned,
            null as memberCount
          from ${schema.articles}
          where ${and(eq(schema.articles.updatedAt, boundaryTime), whereClause)}
        `);
        unpinnedRows.push(...strictlyNewer, ...tiedRows);
      } else {
        unpinnedRows.push(...articleRows.slice(0, remaining));
      }
    }

    if (hasWeRead) {
      const weReadScope = hasMembers ? weReadScopeCondition(database, input) : undefined;
      const notPinned = hasPins
        ? notExists(
            database
              .select({ value: sql`1` })
              .from(schema.libraryPins)
              .where(
                and(
                  eq(schema.libraryPins.targetKind, 'weread'),
                  eq(schema.libraryPins.targetId, schema.wereadBooks.bookId),
                ),
              ),
          )
        : undefined;
      const weReadRows = database.all<FastCandidateRow>(sql`
        select
          ${'item'} as kind,
          ${schema.wereadBooks.bookId} as id,
          ${'weread'} as type,
          ${weReadSortTime()} as sortTime,
          ${schema.wereadBooks.title} as title,
          0 as pinned,
          null as memberCount
        from ${schema.wereadBooks}
        where ${requiredCondition(and(weReadScope, notPinned))}
        order by sortTime desc, title collate nocase asc, id asc
        limit ${remaining}
      `);
      unpinnedRows.push(...weReadRows);
    }

    if (hasCollections) {
      const notPinned = hasPins
        ? notExists(
            database
              .select({ value: sql`1` })
              .from(schema.libraryPins)
              .where(
                and(
                  eq(schema.libraryPins.targetKind, 'collection'),
                  eq(schema.libraryPins.targetId, schema.collections.id),
                ),
              ),
          )
        : undefined;
      const collectionRows = database.all<FastCandidateRow>(sql`
        select
          ${'collection'} as kind,
          ${schema.collections.id} as id,
          ${'collection'} as type,
          ${schema.collections.updatedAt} as sortTime,
          ${schema.collections.name} as title,
          0 as pinned,
          (
            select count(*)
            from ${schema.collectionMembers}
            where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
          ) as memberCount
        from ${schema.collections}
        where ${requiredCondition(notPinned)}
        order by ${schema.collections.updatedAt} desc, ${schema.collections.name} collate nocase asc, ${schema.collections.id} asc
        limit ${remaining}
      `);
      unpinnedRows.push(...collectionRows);
    }

    unpinnedRows.sort(compareRecentCandidates);
    rows.push(...unpinnedRows.slice(0, remaining));
  }

  return {
    candidates: rows.slice(offset, offset + limit).map(rowToCatalogCandidate),
    totalCount,
  };
}

function compareRecentCandidates(left: FastCandidateRow, right: FastCandidateRow) {
  if (left.pinned !== right.pinned) return right.pinned - left.pinned;
  if (left.sortTime !== right.sortTime) return left.sortTime < right.sortTime ? 1 : -1;
  const titleCmp = compareUtf8AsciiNocase(left.title, right.title);
  if (titleCmp !== 0) return titleCmp;
  return compareUtf8Binary(left.id, right.id);
}

// Mirrors SQLite's built-in COLLATE NOCASE (sqlite3StrNICmp stops at NUL, folds ASCII A-Z,
// compares unsigned UTF-8 byte / Unicode scalar order, and breaks ties by UTF-8 byte length).
function compareUtf8AsciiNocase(left: string, right: string) {
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    let a = left.codePointAt(i) ?? 0;
    let b = right.codePointAt(j) ?? 0;
    if (a === 0 && b === 0) return Buffer.byteLength(left) - Buffer.byteLength(right);
    i += a > 0xffff ? 2 : 1;
    j += b > 0xffff ? 2 : 1;
    if (a >= 65 && a <= 90) a += 32;
    if (b >= 65 && b <= 90) b += 32;
    if (a !== b) return a - b;
  }
  return left.length - i - (right.length - j);
}

function compareUtf8Binary(left: string, right: string) {
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i) ?? 0;
    const b = right.codePointAt(j) ?? 0;
    i += a > 0xffff ? 2 : 1;
    j += b > 0xffff ? 2 : 1;
    if (a !== b) return a - b;
  }
  return left.length - i - (right.length - j);
}

function rowToCatalogCandidate(row: FastCandidateRow): CatalogCandidate {
  if (row.kind === 'collection') {
    return {
      kind: 'collection',
      id: row.id,
      sortTime: row.sortTime,
      title: row.title,
      pinned: Boolean(row.pinned),
      memberCount: row.memberCount ?? 0,
    };
  }
  if (row.type === 'collection') throw new Error('LIBRARY_CATALOG_INVALID_ITEM_TYPE');
  return {
    kind: 'item',
    id: row.id,
    type: row.type,
    sortTime: row.sortTime,
    title: row.title,
    pinned: Boolean(row.pinned),
  };
}

function readCatalogPage(
  database: StoreDatabase,
  input: NormalizedInput,
  offset: number,
  limit: number,
  unfilteredCount: number,
  itemCounts: LibraryCatalogItemCounts,
  tableCounts: AuxTableCounts,
) {
  const isUnfiltered = input.query === '' && input.status === 'all';
  const ftsMatchQuery = ftsMatchExpression(input.query);
  const hasPins = tableCounts.pins > 0;
  const hasMembers = tableCounts.collectionMembers > 0;
  const hasArticles = input.articleSources.some((source) => itemCounts[source] > 0);
  const hasWeRead = input.types.has('weread') && itemCounts.weread > 0;
  const hasCollections = showsCollections(input) && tableCounts.collections > 0;
  const selects: SQL[] = [];
  const singleArticleFts = ftsMatchQuery !== null && hasArticles && !hasWeRead && !hasCollections;
  if (hasArticles) {
    selects.push(
      articleCandidateSelect(database, input, ftsMatchQuery, hasPins, hasMembers, singleArticleFts),
    );
  }
  if (hasWeRead) {
    selects.push(weReadCandidateSelect(database, input, ftsMatchQuery, hasPins, hasMembers));
  }
  if (hasCollections) {
    selects.push(collectionCandidateSelect(database, input, ftsMatchQuery, hasPins));
  }
  if (selects.length === 0) {
    return { candidates: [] as CatalogCandidate[], totalCount: 0 };
  }
  const union = sql.join(selects, sql` union all `);
  const orderBy = orderBySql(input.sort);
  const ctePrefix =
    ftsMatchQuery && !singleArticleFts
      ? sql`with fts_matches as materialized (
          select kind, id
          from library_catalog_fts
          where library_catalog_fts match ${ftsMatchQuery}
        ),
        filtered_candidates as materialized (${union})`
      : sql`with filtered_candidates as materialized (${union})`;

  let rows: CatalogPageRow[];
  try {
    if (isUnfiltered) {
      rows = database.all(sql`
        ${ctePrefix}
        select
          kind,
          id,
          type,
          sortTime,
          title,
          pinned,
          memberCount,
          ${unfilteredCount} as totalCount
        from filtered_candidates
        order by ${orderBy}
        limit ${limit}
        offset ${offset}
      `);
      return {
        candidates: rows
          .map(pageRowToCandidate)
          .filter((item): item is CatalogCandidate => Boolean(item)),
        totalCount: unfilteredCount,
      };
    }

    rows = database.all(sql`
      ${ctePrefix},
      catalog_counts as (
        select count(*) as totalCount
        from filtered_candidates
      ),
      page_candidates as (
        select kind, id, type, sortTime, title, pinned, memberCount
        from filtered_candidates
        order by ${orderBy}
        limit ${limit}
        offset ${offset}
      )
      select
        page_candidates.kind,
        page_candidates.id,
        page_candidates.type,
        page_candidates.sortTime,
        page_candidates.title,
        page_candidates.pinned,
        page_candidates.memberCount,
        catalog_counts.totalCount
      from catalog_counts
      left join page_candidates on 1 = 1
    `);
  } catch (error) {
    console.error('[library-catalog] candidate query failed', {
      error,
      limit,
      offset,
      query: input.query,
      scope: input.scope,
      sort: input.sort,
      status: input.status,
      types: [...input.types],
    });
    throw error;
  }
  const firstRow = rows[0];
  return {
    candidates: rows
      .map(pageRowToCandidate)
      .filter((item): item is CatalogCandidate => Boolean(item)),
    totalCount: firstRow?.totalCount || 0,
  };
}

function pageRowToCandidate(row: CatalogPageRow): CatalogCandidate | null {
  if (!row.kind || !row.id || !row.type || row.sortTime === null || row.title === null) {
    return null;
  }
  if (row.kind === 'collection') {
    return {
      kind: 'collection',
      id: row.id,
      sortTime: row.sortTime,
      title: row.title,
      pinned: Boolean(row.pinned),
      memberCount: row.memberCount ?? 0,
    };
  }
  if (row.type === 'collection') throw new Error('LIBRARY_CATALOG_INVALID_ITEM_TYPE');
  return {
    kind: 'item',
    id: row.id,
    type: row.type,
    sortTime: row.sortTime,
    title: row.title,
    pinned: Boolean(row.pinned),
  };
}

type CatalogPageRow = {
  kind: CatalogCandidate['kind'] | null;
  id: string | null;
  type: LibraryCatalogType | null;
  sortTime: string | null;
  title: string | null;
  pinned: number | null;
  memberCount: number | null;
  totalCount: number;
};

function articleSourceFilter(
  sources: Exclude<LibraryCatalogItemType, 'weread'>[],
): SQL | undefined {
  if (sources.length === ARTICLE_SOURCE_TYPES.length) return undefined;
  if (sources.length === 1) return eq(schema.articles.sourceType, sources[0]);
  return inArray(schema.articles.sourceType, sources);
}

function articleDisplayTitleSql() {
  return sql`case when ${schema.articles.sourceType} = 'ebook' then coalesce(nullif(json_extract(${schema.articles.ebookMetadata}, '$.displayTitle'), ''), ${schema.articles.title}) else ${schema.articles.title} end`;
}

function articleCandidateSelect(
  database: StoreDatabase,
  input: NormalizedInput,
  ftsMatchQuery: string | null,
  hasPins: boolean,
  hasMembers: boolean,
  singleArticleFts: boolean,
) {
  const pinned = hasPins
    ? sql`case when ${schema.libraryPins.targetId} is null then 0 else 1 end`
    : sql`0`;
  const pinsJoin = hasPins
    ? sql`left join ${schema.libraryPins}
        on ${schema.libraryPins.targetKind} = ${'article'}
        and ${schema.libraryPins.targetId} = ${schema.articles.id}`
    : sql``;
  const title = articleDisplayTitleSql();
  const sourceCondition = articleSourceFilter(input.articleSources);
  const readingProgress = needsReadingProgress(input) ? articleReadingProgressSql() : sql`0.0`;
  const annotationCount = needsAnnotationCount(input) ? articleAnnotationCountSql() : sql`0`;
  const statusFilter = articleStatusFilterSql(input.status);
  const searchFilter = ftsMatchQuery
    ? undefined
    : articleFallbackSearchCondition(schema.articles, input.query);
  const scopeFilter = hasMembers ? articleScopeCondition(database, input) : undefined;
  const ftsSource =
    ftsMatchQuery && singleArticleFts
      ? sql`(select id from library_catalog_fts where kind = ${'article'} and library_catalog_fts match ${ftsMatchQuery})`
      : null;

  if (input.scope.kind === 'collection') {
    const ftsJoin = ftsMatchQuery
      ? ftsSource
        ? sql`inner join ${ftsSource} as fts_hit on fts_hit.id = ${schema.articles.id}`
        : sql`inner join fts_matches on fts_matches.kind = ${'article'} and fts_matches.id = ${schema.articles.id}`
      : sql``;
    return sql`
      select
        ${'item'} as kind,
        ${schema.articles.id} as id,
        ${schema.articles.sourceType} as type,
        ${schema.articles.updatedAt} as sortTime,
        ${title} as title,
        ${pinned} as pinned,
        null as memberCount,
        ${readingProgress} as readingProgress,
        ${annotationCount} as annotationCount
      from ${schema.collectionMembers}
      inner join ${schema.articles}
        on ${schema.collectionMembers.memberKind} = ${'article'}
        and ${schema.collectionMembers.memberId} = ${schema.articles.id}
      ${ftsJoin}
      ${pinsJoin}
      where ${and(
        eq(schema.collectionMembers.collectionId, input.scope.collectionId),
        sourceCondition,
        searchFilter,
        statusFilter,
      )}
    `;
  }

  if (ftsMatchQuery) {
    // Drive directly from FTS hits -> articles PK lookup so non-matching rows are never scanned.
    const ftsFrom = ftsSource
      ? sql`${ftsSource} as fts_hit inner join ${schema.articles} on ${schema.articles.id} = fts_hit.id`
      : sql`fts_matches inner join ${schema.articles} on fts_matches.kind = ${'article'} and ${schema.articles.id} = fts_matches.id`;
    return sql`
      select
        ${'item'} as kind,
        ${schema.articles.id} as id,
        ${schema.articles.sourceType} as type,
        ${schema.articles.updatedAt} as sortTime,
        ${title} as title,
        ${pinned} as pinned,
        null as memberCount,
        ${readingProgress} as readingProgress,
        ${annotationCount} as annotationCount
      from ${ftsFrom}
      ${pinsJoin}
      where ${requiredCondition(and(sourceCondition, scopeFilter, statusFilter))}
    `;
  }

  return sql`
    select
      ${'item'} as kind,
      ${schema.articles.id} as id,
      ${schema.articles.sourceType} as type,
      ${schema.articles.updatedAt} as sortTime,
      ${title} as title,
      ${pinned} as pinned,
      null as memberCount,
      ${readingProgress} as readingProgress,
      ${annotationCount} as annotationCount
    from ${schema.articles}
    ${pinsJoin}
    where ${requiredCondition(and(sourceCondition, searchFilter, statusFilter, scopeFilter))}
  `;
}

function weReadCandidateSelect(
  database: StoreDatabase,
  input: NormalizedInput,
  ftsMatchQuery: string | null,
  hasPins: boolean,
  hasMembers: boolean,
) {
  const pinned = hasPins
    ? sql`case when ${schema.libraryPins.targetId} is null then 0 else 1 end`
    : sql`0`;
  const pinsJoin = hasPins
    ? sql`left join ${schema.libraryPins}
        on ${schema.libraryPins.targetKind} = ${'weread'}
        and ${schema.libraryPins.targetId} = ${schema.wereadBooks.bookId}`
    : sql``;
  const readingProgress = needsReadingProgress(input) ? weReadReadingProgressSql() : sql`0.0`;
  const annotationCount = needsAnnotationCount(input)
    ? sql`coalesce(${schema.wereadBooks.noteCount}, 0)`
    : sql`0`;
  const statusFilter = weReadStatusFilterSql(input.status);
  const searchFilter = ftsMatchQuery
    ? undefined
    : weReadFallbackSearchCondition(schema.wereadBooks, input.query);
  const scopeFilter = hasMembers ? weReadScopeCondition(database, input) : undefined;

  if (input.scope.kind === 'collection') {
    const ftsJoin = ftsMatchQuery
      ? sql`inner join fts_matches on fts_matches.kind = ${'weread'} and fts_matches.id = ${schema.wereadBooks.bookId}`
      : sql``;
    return sql`
      select
        ${'item'} as kind,
        ${schema.wereadBooks.bookId} as id,
        ${'weread'} as type,
        ${weReadSortTime()} as sortTime,
        ${schema.wereadBooks.title} as title,
        ${pinned} as pinned,
        null as memberCount,
        ${readingProgress} as readingProgress,
        ${annotationCount} as annotationCount
      from ${schema.collectionMembers}
      inner join ${schema.wereadBooks}
        on ${schema.collectionMembers.memberKind} = ${'weread'}
        and ${schema.collectionMembers.memberId} = ${schema.wereadBooks.bookId}
      ${ftsJoin}
      ${pinsJoin}
      where ${and(eq(schema.collectionMembers.collectionId, input.scope.collectionId), searchFilter, statusFilter)}
    `;
  }

  if (ftsMatchQuery) {
    return sql`
      select
        ${'item'} as kind,
        ${schema.wereadBooks.bookId} as id,
        ${'weread'} as type,
        ${weReadSortTime()} as sortTime,
        ${schema.wereadBooks.title} as title,
        ${pinned} as pinned,
        null as memberCount,
        ${readingProgress} as readingProgress,
        ${annotationCount} as annotationCount
      from fts_matches
      inner join ${schema.wereadBooks}
        on fts_matches.kind = ${'weread'}
        and ${schema.wereadBooks.bookId} = fts_matches.id
      ${pinsJoin}
      where ${requiredCondition(and(scopeFilter, statusFilter))}
    `;
  }

  return sql`
    select
      ${'item'} as kind,
      ${schema.wereadBooks.bookId} as id,
      ${'weread'} as type,
      ${weReadSortTime()} as sortTime,
      ${schema.wereadBooks.title} as title,
      ${pinned} as pinned,
      null as memberCount,
      ${readingProgress} as readingProgress,
      ${annotationCount} as annotationCount
    from ${schema.wereadBooks}
    ${pinsJoin}
    where ${requiredCondition(and(searchFilter, statusFilter, scopeFilter))}
  `;
}

function collectionCandidateSelect(
  database: StoreDatabase,
  input: NormalizedInput,
  ftsMatchQuery: string | null,
  hasPins: boolean,
) {
  const pinned = hasPins
    ? sql`case when ${schema.libraryPins.targetId} is null then 0 else 1 end`
    : sql`0`;
  const pinsJoin = hasPins
    ? sql`left join ${schema.libraryPins}
        on ${schema.libraryPins.targetKind} = ${'collection'}
        and ${schema.libraryPins.targetId} = ${schema.collections.id}`
    : sql``;
  const memberCount = sql`(
    select count(*)
    from ${schema.collectionMembers}
    where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
  )`;
  const searchFilter = collectionSearchCondition(database, input.query, ftsMatchQuery);
  return sql`
    select
      ${'collection'} as kind,
      ${schema.collections.id} as id,
      ${'collection'} as type,
      ${schema.collections.updatedAt} as sortTime,
      ${schema.collections.name} as title,
      ${pinned} as pinned,
      ${memberCount} as memberCount,
      0.0 as readingProgress,
      0 as annotationCount
    from ${schema.collections}
    ${pinsJoin}
    where ${requiredCondition(searchFilter)}
  `;
}

function needsReadingProgress(input: NormalizedInput) {
  return (
    input.sort === 'progress' ||
    input.status === 'unread' ||
    input.status === 'reading' ||
    input.status === 'completed'
  );
}

function needsAnnotationCount(input: NormalizedInput) {
  return input.sort === 'annotations' || input.status === 'annotated';
}

function articleReadingProgressSql() {
  const progress = schema.articles.readingProgress;
  return sql`case coalesce(json_extract(${progress}, '$.kind'), case
    when ${schema.articles.sourceType} = 'pdf' and json_extract(${progress}, '$.pageIndex') is not null then 'page'
  end)
    when 'scroll' then min(1.0, max(0.0, coalesce(cast(json_extract(${schema.articles.readingProgress}, '$.progress') as real), 0.0)))
    when 'chapter' then min(1.0, max(0.0, coalesce(cast(json_extract(${schema.articles.readingProgress}, '$.bookProgress') as real), 0.0)))
    when 'page' then case
      when json_extract(${schema.articles.readingProgress}, '$.updatedAt') = ${schema.articles.createdAt} and json_extract(${schema.articles.readingProgress}, '$.pageIndex') = 0 then 0.0
      else min(1.0, (1.0 + json_extract(${schema.articles.readingProgress}, '$.pageIndex')) / max(1, json_extract(${schema.articles.readingProgress}, '$.pageCount')))
    end
    else 0.0
  end`;
}

function weReadReadingProgressSql() {
  return sql`min(1.0, max(0.0, coalesce(cast(${schema.wereadBooks.readingProgress} as real), 0.0) / 100.0))`;
}

function articleAnnotationCountSql() {
  return sql`(
    select count(*)
    from ${schema.annotations}
    where ${schema.annotations.articleId} = ${schema.articles.id}
  )`;
}

function articleStatusFilterSql(status: LibraryCatalogStatusFilter): SQL | undefined {
  switch (status) {
    case 'all':
      return undefined;
    case 'unread':
      return sql`${articleReadingProgressSql()} <= 0`;
    case 'reading': {
      const progress = articleReadingProgressSql();
      return sql`${progress} > 0 and ${progress} < case when ${schema.articles.sourceType} = 'pdf' then 1.0 else ${COMPLETED_PROGRESS_THRESHOLD} end`;
    }
    case 'completed':
      return sql`${articleReadingProgressSql()} >= case when ${schema.articles.sourceType} = 'pdf' then 1.0 else ${COMPLETED_PROGRESS_THRESHOLD} end`;
    case 'annotated':
      return sql`exists (select 1 from ${schema.annotations} where ${schema.annotations.articleId} = ${schema.articles.id})`;
  }
}

function weReadStatusFilterSql(status: LibraryCatalogStatusFilter): SQL | undefined {
  switch (status) {
    case 'all':
      return undefined;
    case 'unread':
      return sql`${weReadReadingProgressSql()} <= 0`;
    case 'reading': {
      const progress = weReadReadingProgressSql();
      return sql`${progress} > 0 and ${progress} < ${COMPLETED_PROGRESS_THRESHOLD}`;
    }
    case 'completed':
      return sql`${weReadReadingProgressSql()} >= ${COMPLETED_PROGRESS_THRESHOLD}`;
    case 'annotated':
      return sql`coalesce(${schema.wereadBooks.noteCount}, 0) > 0`;
  }
}

function orderBySql(sort: LibraryCatalogSort) {
  switch (sort) {
    case 'title':
      return sql`pinned desc, title collate nocase asc, sortTime desc, id asc`;
    case 'progress':
      return sql`pinned desc, readingProgress desc, sortTime desc, title collate nocase asc, id asc`;
    case 'annotations':
      return sql`pinned desc, annotationCount desc, sortTime desc, title collate nocase asc, id asc`;
    case 'recent':
      return sql`pinned desc, sortTime desc, title collate nocase asc, id asc`;
  }
}

function requiredCondition(condition: SQL | undefined) {
  return condition || sql`1`;
}

function showsCollections(input: NormalizedInput) {
  return input.scope.kind === 'library' && input.status === 'all' && input.types.has('collection');
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

function ftsMatchExpression(query: string): string | null {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (normalized.length < 3) return null;
  return `"${normalized.replaceAll('"', '""')}"`;
}

function articleFallbackSearchCondition(
  table: typeof schema.articles | typeof memberArticle,
  query: string,
): SQL | undefined {
  const matcher = createTextMatcher(query);
  if (!matcher) return undefined;
  return or(
    matcher(table.title),
    matcher(table.byline),
    matcher(table.siteName),
    matcher(table.excerpt),
    matcher(table.url),
    matcher(table.canonicalUrl),
    and(eq(table.sourceType, 'ebook'), matcher(table.ebookMetadata)),
    and(eq(table.sourceType, 'pdf'), matcher(table.pdfMetadata)),
    and(eq(table.sourceType, 'text'), matcher(table.textMetadata)),
  );
}

function weReadFallbackSearchCondition(
  table: typeof schema.wereadBooks | typeof memberWeReadBook,
  query: string,
): SQL | undefined {
  const matcher = createTextMatcher(query);
  if (!matcher) return undefined;
  return or(matcher(table.title), matcher(table.author), matcher(table.intro));
}

function collectionSearchCondition(
  database: StoreDatabase,
  query: string,
  ftsMatchQuery: string | null,
): SQL | undefined {
  if (!query.trim()) return undefined;
  if (ftsMatchQuery) {
    const memberMatches = sql`exists (
      select 1
      from ${schema.collectionMembers}
      inner join fts_matches
        on fts_matches.kind = ${schema.collectionMembers.memberKind}
        and fts_matches.id = ${schema.collectionMembers.memberId}
      where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
    )`;
    return or(
      sql`exists (select 1 from fts_matches where fts_matches.kind = ${'collection'} and fts_matches.id = ${schema.collections.id})`,
      memberMatches,
    );
  }
  const matcher = createTextMatcher(query);
  if (!matcher) return undefined;
  const ownFallback = or(matcher(schema.collections.name), matcher(schema.collections.desc));
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
          articleFallbackSearchCondition(memberArticle, query),
          weReadFallbackSearchCondition(memberWeReadBook, query),
        ),
      ),
    );
  return or(ownFallback, exists(memberMatches));
}

function createTextMatcher(query: string): ((column: AnyColumn) => SQL) | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const normalized = trimmed.toLocaleLowerCase('zh-CN');
  // Pure non-cased scripts (e.g. CJK) match directly via instr() with zero lower() allocations.
  if (trimmed.toLocaleUpperCase('zh-CN') === normalized) {
    return (column) => sql`instr(${column}, ${normalized}) > 0`;
  }
  const pattern = `%${normalized.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  // SQLite LIKE is ASCII case-insensitive; avoid lower() allocations for pure ASCII queries.
  if (isAsciiString(normalized)) {
    return (column) => sql`${column} like ${pattern} escape '\\'`;
  }
  return (column) => sql`lower(coalesce(${column}, '')) like ${pattern} escape '\\'`;
}

function isAsciiString(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

function readItemCounts(database: StoreDatabase): LibraryCatalogItemCounts {
  const counts: LibraryCatalogItemCounts = { web: 0, ebook: 0, pdf: 0, text: 0, weread: 0 };
  const rows = database.all<{ source: string; count: number }>(sql`
    select source_type as source, count(*) as count
    from ${schema.articles}
    group by source_type
    union all
    select ${'weread'} as source, count(*) as count
    from ${schema.wereadBooks}
  `);
  for (const row of rows) {
    if (row.source === 'weread') {
      counts.weread = row.count || 0;
      continue;
    }
    const source = normalizeArticleSourceType(row.source);
    counts[source] += row.count || 0;
  }
  return counts;
}
