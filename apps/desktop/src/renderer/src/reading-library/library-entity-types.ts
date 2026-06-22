import type { ArticleSummaryRecord, Collection, ContentRef, WeReadBook } from '@yomitomo/shared';

export type LibraryItemType = 'web' | 'ebook' | 'pdf' | 'weread';

export type LibraryItemEntity = {
  kind: 'item';
  ref: ContentRef;
  type: LibraryItemType;
  sortTime: string;
  pinned: boolean;
  article?: ArticleSummaryRecord;
  weread?: WeReadBook;
};

export type LibraryCollectionEntity = {
  kind: 'col';
  collection: Collection;
  memberRefs: ContentRef[];
  coverMembers: LibraryItemEntity[];
  searchMembers: LibraryItemEntity[];
  memberCount: number;
  sortTime: string;
  pinned: boolean;
};

export type LibraryEntity = LibraryItemEntity | LibraryCollectionEntity;

export type LibraryTypeScope = 'all' | 'collection' | LibraryItemType;

export type LibraryTypeFilter = 'collection' | LibraryItemType;
