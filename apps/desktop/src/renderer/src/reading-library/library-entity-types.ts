import type {
  LibraryCatalogCollection,
  LibraryCatalogItem,
  LibraryCatalogItemType,
} from '../../../ipc-contract';

export type LibraryItemType = LibraryCatalogItemType;

export type LibraryItemEntity = LibraryCatalogItem;

export type LibraryCollectionEntity = LibraryCatalogCollection & {
  searchMembers?: LibraryItemEntity[];
};

export type LibraryEntity = LibraryItemEntity | LibraryCollectionEntity;

export type LibraryTypeScope = 'all' | 'collection' | LibraryItemType;

export type LibraryTypeFilter = 'collection' | LibraryItemType;
