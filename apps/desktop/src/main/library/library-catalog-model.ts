import type { LibraryCatalogItemType, LibraryCatalogType } from '../../ipc-contract';

export const ARTICLE_CATALOG_TYPES: Array<Exclude<LibraryCatalogItemType, 'weread'>> = [
  'web',
  'ebook',
  'pdf',
  'text',
];

export type CatalogCandidate = {
  kind: 'collection' | 'item';
  id: string;
  type: LibraryCatalogType;
  sortTime: string;
  title: string;
  pinned: boolean;
  memberCount?: number;
};
