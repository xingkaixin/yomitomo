import { inArray, sql } from 'drizzle-orm';
import type {
  LibraryCatalogCollection,
  LibraryCatalogEntity,
  LibraryCatalogItem,
  LibraryCatalogItemType,
} from '../../ipc-contract';
import { articleSummaryColumns } from '../articles/article-repository-columns';
import { readArticleSummaryCountsForArticles } from '../articles/article-summary-counts';
import * as schema from '../db/schema';
import type { StoreDatabase } from '../store/store-db';
import { rowToArticleSummary, rowToCollection } from '../store/store-normalizers';
import { rowToWeReadBook } from '../weread/weread-repository';
import { ARTICLE_CATALOG_TYPES, type CatalogCandidate } from './library-catalog-model';

const COLLECTION_COVER_LIMIT = 9;

type CollectionCoverRef = {
  collectionId: string;
  kind: 'article' | 'weread';
  id: string;
};

export function hydrateCatalogCandidates(
  database: StoreDatabase,
  candidates: CatalogCandidate[],
): LibraryCatalogEntity[] {
  const collectionIds = candidates
    .filter((candidate) => candidate.kind === 'collection')
    .map((candidate) => candidate.id);
  const coverRefs = readCollectionCoverRefs(database, collectionIds);
  const articleIds = uniqueIds(
    candidates
      .filter((candidate) => candidate.type !== 'collection' && candidate.type !== 'weread')
      .map((candidate) => candidate.id),
    coverRefs.filter((ref) => ref.kind === 'article').map((ref) => ref.id),
  );
  const weReadIds = uniqueIds(
    candidates.filter((candidate) => candidate.type === 'weread').map((candidate) => candidate.id),
    coverRefs.filter((ref) => ref.kind === 'weread').map((ref) => ref.id),
  );
  const articleMap = readArticlesById(database, articleIds);
  const weReadMap = readWeReadBooksById(database, weReadIds);
  const collectionMap = readCollectionsById(database, collectionIds);
  const coverMembers = groupCoverMembers(coverRefs, articleMap, weReadMap);

  return candidates
    .map((candidate) => {
      if (candidate.kind === 'collection') {
        const collection = collectionMap.get(candidate.id);
        if (!collection) return null;
        return {
          kind: 'col',
          collection,
          coverMembers: coverMembers.get(candidate.id) || [],
          memberCount: candidate.memberCount || 0,
          sortTime: candidate.sortTime,
          pinned: candidate.pinned,
        } satisfies LibraryCatalogCollection;
      }
      return itemFromCandidate(candidate, articleMap, weReadMap);
    })
    .filter((entity): entity is LibraryCatalogEntity => Boolean(entity));
}

function readArticlesById(database: StoreDatabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, ReturnType<typeof rowToArticleSummary>>();
  const rows = database
    .select(articleSummaryColumns)
    .from(schema.articles)
    .where(inArray(schema.articles.id, ids))
    .all();
  const counts = readArticleSummaryCountsForArticles(database, ids);
  return new Map(rows.map((row) => [row.id, rowToArticleSummary(row, [], counts.get(row.id))]));
}

function readWeReadBooksById(database: StoreDatabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, ReturnType<typeof rowToWeReadBook>>();
  return new Map(
    database
      .select()
      .from(schema.wereadBooks)
      .where(inArray(schema.wereadBooks.bookId, ids))
      .all()
      .map((row) => [row.bookId, rowToWeReadBook(row)]),
  );
}

function readCollectionsById(database: StoreDatabase, ids: string[]) {
  if (ids.length === 0) return new Map<string, ReturnType<typeof rowToCollection>>();
  return new Map(
    database
      .select()
      .from(schema.collections)
      .where(inArray(schema.collections.id, ids))
      .all()
      .map((row) => [row.id, rowToCollection(row)]),
  );
}

function readCollectionCoverRefs(database: StoreDatabase, collectionIds: string[]) {
  if (collectionIds.length === 0) return [];
  const idList = sql.join(
    collectionIds.map((id) => sql`${id}`),
    sql`, `,
  );
  return database.all<CollectionCoverRef>(sql`
    select
      collection_id as "collectionId",
      member_kind as "kind",
      member_id as "id"
    from (
      select
        collection_id,
        member_kind,
        member_id,
        row_number() over (
          partition by collection_id
          order by added_at desc, member_kind asc, member_id asc
        ) as member_rank
      from collection_members
      where collection_id in (${idList})
    )
    where member_rank <= ${COLLECTION_COVER_LIMIT}
    order by collection_id asc, member_rank asc
  `);
}

function groupCoverMembers(
  refs: CollectionCoverRef[],
  articleMap: ReturnType<typeof readArticlesById>,
  weReadMap: ReturnType<typeof readWeReadBooksById>,
) {
  const groups = new Map<string, LibraryCatalogItem[]>();
  for (const ref of refs) {
    const item =
      ref.kind === 'article'
        ? articleItem(articleMap.get(ref.id), false)
        : weReadItem(weReadMap.get(ref.id), false);
    if (!item) continue;
    groups.set(ref.collectionId, [...(groups.get(ref.collectionId) || []), item]);
  }
  return groups;
}

function itemFromCandidate(
  candidate: CatalogCandidate,
  articleMap: ReturnType<typeof readArticlesById>,
  weReadMap: ReturnType<typeof readWeReadBooksById>,
) {
  if (candidate.type === 'weread') {
    return weReadItem(weReadMap.get(candidate.id), candidate.pinned, candidate.sortTime);
  }
  return articleItem(articleMap.get(candidate.id), candidate.pinned, candidate.sortTime);
}

function articleItem(
  article: ReturnType<typeof rowToArticleSummary> | undefined,
  pinned: boolean,
  sortTime = article?.createdAt || article?.updatedAt || '',
): LibraryCatalogItem | null {
  if (!article) return null;
  const type = ARTICLE_CATALOG_TYPES.includes(
    article.sourceType as Exclude<LibraryCatalogItemType, 'weread'>,
  )
    ? (article.sourceType as Exclude<LibraryCatalogItemType, 'weread'>)
    : 'web';
  return {
    kind: 'item',
    ref: { kind: 'article', id: article.id },
    type,
    sortTime,
    pinned,
    article,
  };
}

function weReadItem(
  weread: ReturnType<typeof rowToWeReadBook> | undefined,
  pinned: boolean,
  sortTime = weread ? weReadBookSortTime(weread.lastReadAt, weread.updatedAt) : '',
): LibraryCatalogItem | null {
  if (!weread) return null;
  return {
    kind: 'item',
    ref: { kind: 'weread', id: weread.bookId },
    type: 'weread',
    sortTime,
    pinned,
    weread,
  };
}

function weReadBookSortTime(lastReadAt: number | undefined, updatedAt: string) {
  if (!lastReadAt) return updatedAt;
  const timestamp = lastReadAt < 1_000_000_000_000 ? lastReadAt * 1000 : lastReadAt;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? updatedAt : date.toISOString();
}

function uniqueIds(...groups: string[][]) {
  return [...new Set(groups.flat())];
}
