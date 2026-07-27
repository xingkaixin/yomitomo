import type { LibraryCatalogItemType } from '../../ipc-contract';

type CatalogCandidateBase = {
  id: string;
  sortTime: string;
  title: string;
  pinned: boolean;
};

export type CatalogCandidate =
  | (CatalogCandidateBase & {
      kind: 'collection';
      memberCount: number;
    })
  | (CatalogCandidateBase & {
      kind: 'item';
      type: LibraryCatalogItemType;
    });
