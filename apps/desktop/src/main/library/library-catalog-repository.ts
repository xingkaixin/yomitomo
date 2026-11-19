import { and, eq, exists, notExists, or, sql, type AnyColumn, type SQL } from 'drizzle-orm';
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
  const page = readCatalogPage(database, input, offset, input.pageSize);

  return {
    entities: hydrateCatalogCandidates(database, page.candidates),
    itemCounts: readItemCounts(database),
    page: input.page,
    pageSize: input.pageSize,
    query: input.query,
    totalCount: page.totalCount,
    unfilteredCount: page.unfilteredCount,
  };
}

type NormalizedInput = {
  scope: LibraryCatalogScope;
  types: ReadonlySet<LibraryCatalogType>;
  query: string;
  sort: LibraryCatalogSort;
  status: LibraryCatalogStatusFilter;
  page: number;
  pageSize: number;
};

function normalizeInput(input: LibraryCatalogListInput): NormalizedInput {
  const selectedTypes = (input.types || []).filter(isLibraryCatalogType);
  return {
    scope: normalizeScope(input.scope),
    types: new Set(selectedTypes.length > 0 ? selectedTypes : ALL_TYPES),
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

function readCatalogPage(
  database: StoreDatabase,
  input: NormalizedInput,
  offset: number,
  limit: number,
) {
  const selects: SQL[] = [];
  for (const source of ARTICLE_SOURCE_TYPES) {
    if (!input.types.has(source)) continue;
    selects.push(articleCandidateSelect(database, input, source));
  }
  if (input.types.has('weread')) {
    selects.push(weReadCandidateSelect(database, input));
  }
  if (showsCollections(input)) {
    selects.push(collectionCandidateSelect(database, input));
  }
  const union = selects.length > 0 ? sql.join(selects, sql` union all `) : emptyCandidateSelect();
  const statusCondition = statusMatchSql(input.status);
  const orderBy = orderBySql(input.sort);
  let rows: CatalogPageRow[];
  try {
    rows = database.all(sql`
      with all_candidates as (${union}),
      catalog_counts as (
        select
          coalesce(sum(case when matchesQuery = 1 and ${statusCondition} then 1 else 0 end), 0) as totalCount,
          count(*) as unfilteredCount
        from all_candidates
      ),
      page_candidates as (
        select kind, id, type, sortTime, title, pinned, memberCount
        from all_candidates
        where matchesQuery = 1 and ${statusCondition}
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
        catalog_counts.totalCount,
        catalog_counts.unfilteredCount
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
  const candidates = rows.flatMap((row): CatalogCandidate[] => {
    if (!row.kind || !row.id || !row.type || row.sortTime === null || row.title === null) {
      return [];
    }
    if (row.kind === 'collection') {
      return [
        {
          kind: 'collection',
          id: row.id,
          sortTime: row.sortTime,
          title: row.title,
          pinned: Boolean(row.pinned),
          memberCount: row.memberCount ?? 0,
        },
      ];
    }
    if (row.type === 'collection') throw new Error('LIBRARY_CATALOG_INVALID_ITEM_TYPE');
    return [
      {
        kind: 'item',
        id: row.id,
        type: row.type,
        sortTime: row.sortTime,
        title: row.title,
        pinned: Boolean(row.pinned),
      },
    ];
  });
  return {
    candidates,
    totalCount: firstRow?.totalCount || 0,
    unfilteredCount: firstRow?.unfilteredCount || 0,
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
  unfilteredCount: number;
};

function articleCandidateSelect(
  database: StoreDatabase,
  input: NormalizedInput,
  source: Exclude<LibraryCatalogItemType, 'weread'>,
) {
  const pinned = sql`case when ${schema.libraryPins.targetId} is null then 0 else 1 end`;
  const title =
    source === 'ebook'
      ? sql`coalesce(nullif(json_extract(${schema.articles.ebookMetadata}, '$.displayTitle'), ''), ${schema.articles.title})`
      : schema.articles.title;
  const matchesQuery = searchMatch(articleSearchCondition(schema.articles, input.query));
  const readingProgress = needsReadingProgress(input) ? articleReadingProgressSql() : sql`0.0`;
  const annotationCount = needsAnnotationCount(input) ? articleAnnotationCountSql() : sql`0`;
  if (input.scope.kind === 'collection') {
    return sql`
      select
        ${'item'} as kind,
        ${schema.articles.id} as id,
        ${source} as type,
        ${schema.articles.updatedAt} as sortTime,
        ${title} as title,
        ${pinned} as pinned,
        null as memberCount,
        ${readingProgress} as readingProgress,
        ${annotationCount} as annotationCount,
        ${matchesQuery} as matchesQuery
      from ${schema.collectionMembers}
      inner join ${schema.articles}
        on ${schema.collectionMembers.memberKind} = ${'article'}
        and ${schema.collectionMembers.memberId} = ${schema.articles.id}
      left join ${schema.libraryPins}
        on ${schema.libraryPins.targetKind} = ${'article'}
        and ${schema.libraryPins.targetId} = ${schema.articles.id}
      where ${and(
        eq(schema.collectionMembers.collectionId, input.scope.collectionId),
        eq(schema.articles.sourceType, source),
      )}
    `;
  }
  return sql`
    select
      ${'item'} as kind,
      ${schema.articles.id} as id,
      ${source} as type,
      ${schema.articles.updatedAt} as sortTime,
      ${title} as title,
      ${pinned} as pinned,
      null as memberCount,
      ${readingProgress} as readingProgress,
      ${annotationCount} as annotationCount,
      ${matchesQuery} as matchesQuery
    from ${schema.articles}
    left join ${schema.libraryPins}
      on ${schema.libraryPins.targetKind} = ${'article'}
      and ${schema.libraryPins.targetId} = ${schema.articles.id}
    where ${and(eq(schema.articles.sourceType, source), articleScopeCondition(database, input))}
  `;
}

function weReadCandidateSelect(database: StoreDatabase, input: NormalizedInput) {
  const pinned = sql`case when ${schema.libraryPins.targetId} is null then 0 else 1 end`;
  const matchesQuery = searchMatch(weReadSearchCondition(schema.wereadBooks, input.query));
  const readingProgress = needsReadingProgress(input) ? weReadReadingProgressSql() : sql`0.0`;
  const annotationCount = needsAnnotationCount(input)
    ? sql`coalesce(${schema.wereadBooks.noteCount}, 0)`
    : sql`0`;
  if (input.scope.kind === 'collection') {
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
        ${annotationCount} as annotationCount,
        ${matchesQuery} as matchesQuery
      from ${schema.collectionMembers}
      inner join ${schema.wereadBooks}
        on ${schema.collectionMembers.memberKind} = ${'weread'}
        and ${schema.collectionMembers.memberId} = ${schema.wereadBooks.bookId}
      left join ${schema.libraryPins}
        on ${schema.libraryPins.targetKind} = ${'weread'}
        and ${schema.libraryPins.targetId} = ${schema.wereadBooks.bookId}
      where ${eq(schema.collectionMembers.collectionId, input.scope.collectionId)}
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
      ${annotationCount} as annotationCount,
      ${matchesQuery} as matchesQuery
    from ${schema.wereadBooks}
    left join ${schema.libraryPins}
      on ${schema.libraryPins.targetKind} = ${'weread'}
      and ${schema.libraryPins.targetId} = ${schema.wereadBooks.bookId}
    where ${requiredCondition(weReadScopeCondition(database, input))}
  `;
}

function collectionCandidateSelect(database: StoreDatabase, input: NormalizedInput) {
  const memberCount = sql`(
    select count(*)
    from ${schema.collectionMembers}
    where ${schema.collectionMembers.collectionId} = ${schema.collections.id}
  )`;
  const matchesQuery = searchMatch(collectionSearchCondition(database, input.query));
  return sql`
    select
      ${'collection'} as kind,
      ${schema.collections.id} as id,
      ${'collection'} as type,
      ${schema.collections.updatedAt} as sortTime,
      ${schema.collections.name} as title,
      case when ${schema.libraryPins.targetId} is null then 0 else 1 end as pinned,
      ${memberCount} as memberCount,
      0.0 as readingProgress,
      0 as annotationCount,
      ${matchesQuery} as matchesQuery
    from ${schema.collections}
    left join ${schema.libraryPins}
      on ${schema.libraryPins.targetKind} = ${'collection'}
      and ${schema.libraryPins.targetId} = ${schema.collections.id}
  `;
}

function emptyCandidateSelect() {
  return sql`
    select
      ${'item'} as kind,
      ${''} as id,
      ${'web'} as type,
      ${''} as sortTime,
      ${''} as title,
      0 as pinned,
      null as memberCount,
      0.0 as readingProgress,
      0 as annotationCount,
      0 as matchesQuery
    where 0
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

function statusMatchSql(status: LibraryCatalogStatusFilter) {
  switch (status) {
    case 'unread':
      return sql`readingProgress <= 0`;
    case 'reading':
      return sql`readingProgress > 0 and readingProgress < case when type = 'pdf' then 1.0 else ${COMPLETED_PROGRESS_THRESHOLD} end`;
    case 'completed':
      return sql`readingProgress >= case when type = 'pdf' then 1.0 else ${COMPLETED_PROGRESS_THRESHOLD} end`;
    case 'annotated':
      return sql`annotationCount > 0`;
    case 'all':
      return sql`1`;
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

function searchMatch(condition: SQL | undefined) {
  return sql`case when ${requiredCondition(condition)} then 1 else 0 end`;
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
