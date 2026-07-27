import type { LibraryCatalogType } from '../../ipc-contract';

export type CatalogCandidate = {
  kind: 'collection' | 'item';
  id: string;
  type: LibraryCatalogType;
  sortTime: string;
  title: string;
  pinned: boolean;
  memberCount?: number;
};
