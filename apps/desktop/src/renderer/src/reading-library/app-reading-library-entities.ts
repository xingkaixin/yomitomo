import type {
  ArticleSummaryRecord,
  Collection,
  CollectionMember,
  ContentRef,
  LibraryPin,
  LibraryPinTargetKind,
  WeReadBook,
} from '@yomitomo/shared';
import {
  articleDisplayTitle,
  articleMatchesLibrarySearch,
  librarySourceForArticle,
  weReadBookLibraryDate,
} from './app-reading-library-utils';
import type {
  LibraryCollectionEntity,
  LibraryEntity,
  LibraryItemEntity,
  LibraryItemType,
  LibraryTypeFilter,
  LibraryTypeScope,
} from './library-entity-types';

const COLLECTION_COVER_PREVIEW_LIMIT = 9;

const EMPTY_TYPE_FILTER: ReadonlySet<LibraryTypeFilter> = new Set();

export function libraryTypeFilterFromScope(
  scope: LibraryTypeScope,
): ReadonlySet<LibraryTypeFilter> {
  return scope === 'all' ? EMPTY_TYPE_FILTER : new Set([scope]);
}

export function buildLibraryEntities({
  articles,
  collectionMembers,
  collections,
  enabledTypes,
  pins,
  query,
  typeFilter,
  wereadBooks,
}: {
  articles: ArticleSummaryRecord[];
  collectionMembers: CollectionMember[];
  collections: Collection[];
  enabledTypes: LibraryItemType[];
  pins: LibraryPin[];
  query: string;
  typeFilter: ReadonlySet<LibraryTypeFilter>;
  wereadBooks: WeReadBook[];
}): LibraryEntity[] {
  const pinMap = new Map(pins.map((pin) => [pinKey(pin.targetKind, pin.targetId), pin]));
  const baseItems = buildLibraryItemEntities({ articles, enabledTypes, pinMap, wereadBooks });
  const itemByRef = new Map(baseItems.map((item) => [contentRefKey(item.ref), item]));
  const collectedRefs = new Set(collectionMembers.map((member) => contentRefKey(member.member)));
  const collectionEntities = buildCollectionEntities({
    collectionMembers,
    collections,
    itemByRef,
    pinMap,
  });
  const showCollections = typeFilter.size === 0 || typeFilter.has('collection');
  const visibleItems = baseItems.filter((item) => {
    if (!typeMatchesFilter(item.type, typeFilter)) return false;
    // 合集卡片可见时隐藏已入合集的散件，避免与合集卡片重复
    return showCollections ? !collectedRefs.has(contentRefKey(item.ref)) : true;
  });
  const entities = showCollections ? [...collectionEntities, ...visibleItems] : visibleItems;

  return entities
    .filter((entity) => libraryEntityMatchesSearch(entity, query))
    .toSorted(compareLibraryEntities);
}

export function buildCollectionMemberEntities({
  articles,
  collectionId,
  collectionMembers,
  enabledTypes,
  pins,
  query,
  typeFilter,
  wereadBooks,
}: {
  articles: ArticleSummaryRecord[];
  collectionId: string;
  collectionMembers: CollectionMember[];
  enabledTypes: LibraryItemType[];
  pins: LibraryPin[];
  query: string;
  typeFilter: ReadonlySet<LibraryTypeFilter>;
  wereadBooks: WeReadBook[];
}): LibraryItemEntity[] {
  const pinMap = new Map(pins.map((pin) => [pinKey(pin.targetKind, pin.targetId), pin]));
  const baseItems = buildLibraryItemEntities({ articles, enabledTypes, pinMap, wereadBooks });
  const itemByRef = new Map(baseItems.map((item) => [contentRefKey(item.ref), item]));

  return collectionMembers
    .filter((member) => member.collectionId === collectionId)
    .map((member) => {
      const item = itemByRef.get(contentRefKey(member.member));
      return item ? Object.assign({}, item, { sortTime: member.addedAt }) : null;
    })
    .filter((item): item is LibraryItemEntity => Boolean(item))
    .filter((item) => typeMatchesFilter(item.type, typeFilter))
    .filter((item) => libraryEntityMatchesSearch(item, query))
    .toSorted(compareLibraryEntities);
}

export function libraryEntityPinTarget(entity: LibraryEntity): {
  kind: LibraryPinTargetKind;
  id: string;
} {
  if (entity.kind === 'col') return { kind: 'collection', id: entity.collection.id };
  return {
    kind: entity.ref.kind,
    id: entity.ref.id,
  };
}

function buildLibraryItemEntities({
  articles,
  enabledTypes,
  pinMap,
  wereadBooks,
}: {
  articles: ArticleSummaryRecord[];
  enabledTypes: LibraryItemType[];
  pinMap: Map<string, LibraryPin>;
  wereadBooks: WeReadBook[];
}): LibraryItemEntity[] {
  const items: LibraryItemEntity[] = [];

  for (const article of articles) {
    const type = librarySourceForArticle(article);
    if (!enabledTypes.includes(type)) continue;
    const ref: ContentRef = { kind: 'article', id: article.id };
    items.push({
      kind: 'item',
      ref,
      type,
      sortTime: article.createdAt || article.updatedAt,
      pinned: pinMap.has(pinKey('article', article.id)),
      article,
    });
  }

  if (enabledTypes.includes('weread')) {
    for (const book of wereadBooks) {
      const ref: ContentRef = { kind: 'weread', id: book.bookId };
      items.push({
        kind: 'item',
        ref,
        type: 'weread',
        sortTime: wereadBookSortTime(book),
        pinned: pinMap.has(pinKey('weread', book.bookId)),
        weread: book,
      });
    }
  }

  return items;
}

function buildCollectionEntities({
  collectionMembers,
  collections,
  itemByRef,
  pinMap,
}: {
  collectionMembers: CollectionMember[];
  collections: Collection[];
  itemByRef: Map<string, LibraryItemEntity>;
  pinMap: Map<string, LibraryPin>;
}): LibraryCollectionEntity[] {
  const membersByCollection = new Map<string, CollectionMember[]>();
  for (const member of collectionMembers) {
    const members = membersByCollection.get(member.collectionId);
    if (members) members.push(member);
    else membersByCollection.set(member.collectionId, [member]);
  }

  return collections.map((collection) => {
    const members = (membersByCollection.get(collection.id) || []).toSorted(
      (left, right) => timestampValue(right.addedAt) - timestampValue(left.addedAt),
    );
    const searchableMembers = members
      .map((member) => itemByRef.get(contentRefKey(member.member)))
      .filter((item): item is LibraryItemEntity => Boolean(item));
    return {
      kind: 'col',
      collection,
      coverMembers: searchableMembers.slice(0, COLLECTION_COVER_PREVIEW_LIMIT),
      searchMembers: searchableMembers,
      memberCount: members.length,
      sortTime: collectionSortTime(collection),
      pinned: pinMap.has(pinKey('collection', collection.id)),
    };
  });
}

function libraryEntityMatchesSearch(entity: LibraryEntity, query: string): boolean {
  const normalizedQuery = normalizeSearchQuery(query);
  if (!normalizedQuery) return true;

  if (entity.kind === 'col') {
    return (
      collectionMatchesSearch(entity.collection, normalizedQuery) ||
      Boolean(
        entity.searchMembers?.some((item) => libraryEntityMatchesSearch(item, normalizedQuery)),
      )
    );
  }

  if (entity.article) return articleMatchesLibrarySearch(entity.article, normalizedQuery);
  if (entity.weread) return weReadBookMatchesSearch(entity.weread, normalizedQuery);
  return false;
}

function typeMatchesFilter(type: LibraryItemType, typeFilter: ReadonlySet<LibraryTypeFilter>) {
  return typeFilter.size === 0 || typeFilter.has(type);
}

function collectionMatchesSearch(collection: Collection, normalizedQuery: string) {
  return [collection.name, collection.desc]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalizedQuery));
}

function weReadBookMatchesSearch(book: WeReadBook, normalizedQuery: string) {
  return [book.title, book.author, book.intro]
    .filter(Boolean)
    .some((value) => String(value).toLocaleLowerCase('zh-CN').includes(normalizedQuery));
}

function compareLibraryEntities(left: LibraryEntity, right: LibraryEntity) {
  return (
    comparePinned(left, right) ||
    compareSortTime(left, right) ||
    entityTitle(left).localeCompare(entityTitle(right), 'zh-CN')
  );
}

function comparePinned(left: LibraryEntity, right: LibraryEntity) {
  return Number(right.pinned) - Number(left.pinned);
}

function compareSortTime(left: LibraryEntity, right: LibraryEntity) {
  return timestampValue(right.sortTime) - timestampValue(left.sortTime);
}

function entityTitle(entity: LibraryEntity) {
  if (entity.kind === 'col') return entity.collection.name;
  return libraryItemTitle(entity);
}

export function libraryItemTitle(item: LibraryItemEntity) {
  if (item.article) return articleDisplayTitle(item.article);
  return item.weread?.title || '';
}

function collectionSortTime(collection: Collection) {
  return collection.createdAt || collection.updatedAt;
}

function wereadBookSortTime(book: WeReadBook) {
  return weReadBookLibraryDate(book);
}

function normalizeSearchQuery(query: string) {
  return query.trim().toLocaleLowerCase('zh-CN');
}

export function contentRefKey(ref: ContentRef) {
  return `${ref.kind}:${ref.id}`;
}

function pinKey(kind: LibraryPinTargetKind, id: string) {
  return `${kind}:${id}`;
}

function timestampValue(value: string | undefined) {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}
