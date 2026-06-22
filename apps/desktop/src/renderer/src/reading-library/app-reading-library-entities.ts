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
  LibraryTypeScope,
} from './library-entity-types';

const COLLECTION_COVER_PREVIEW_LIMIT = 9;

export function buildLibraryEntities({
  articles,
  collectionMembers,
  collections,
  enabledTypes,
  pins,
  query,
  typeScope,
  wereadBooks,
}: {
  articles: ArticleSummaryRecord[];
  collectionMembers: CollectionMember[];
  collections: Collection[];
  enabledTypes: LibraryItemType[];
  pins: LibraryPin[];
  query: string;
  typeScope: LibraryTypeScope;
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
  if (typeScope === 'collection') {
    return collectionEntities
      .filter((entity) => libraryEntityMatchesSearch(entity, query))
      .toSorted(compareLibraryEntities);
  }
  const visibleItems = baseItems.filter((item) => {
    if (!itemTypeMatchesScope(item.type, typeScope)) return false;
    return typeScope === 'all' ? !collectedRefs.has(contentRefKey(item.ref)) : true;
  });

  const entities = typeScope === 'all' ? [...collectionEntities, ...visibleItems] : visibleItems;

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
  typeScope,
  wereadBooks,
}: {
  articles: ArticleSummaryRecord[];
  collectionId: string;
  collectionMembers: CollectionMember[];
  enabledTypes: LibraryItemType[];
  pins: LibraryPin[];
  query: string;
  typeScope: LibraryTypeScope;
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
    .filter((item) => itemTypeMatchesScope(item.type, typeScope))
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
    membersByCollection.set(member.collectionId, [
      ...(membersByCollection.get(member.collectionId) || []),
      member,
    ]);
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
      memberRefs: members.map((member) => member.member),
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
      entity.searchMembers.some((item) => libraryEntityMatchesSearch(item, normalizedQuery))
    );
  }

  if (entity.article) return articleMatchesLibrarySearch(entity.article, normalizedQuery);
  if (entity.weread) return weReadBookMatchesSearch(entity.weread, normalizedQuery);
  return false;
}

function itemTypeMatchesScope(type: LibraryItemType, typeScope: LibraryTypeScope) {
  return typeScope === 'all' || type === typeScope;
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
  if (entity.article) return articleDisplayTitle(entity.article);
  return entity.weread?.title || '';
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

function contentRefKey(ref: ContentRef) {
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
