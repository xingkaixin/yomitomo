export type ContentRefKind = 'article' | 'weread';

export type ContentRef = {
  kind: ContentRefKind;
  id: string;
};

export type Collection = {
  id: string;
  name: string;
  desc?: string;
  createdAt: string;
  updatedAt: string;
};

export type CollectionMember = {
  collectionId: string;
  member: ContentRef;
  addedAt: string;
};

export type CollectionWithMembers = Collection & {
  members: CollectionMember[];
};

export type LibraryPinTargetKind = 'article' | 'weread' | 'collection';

export type LibraryPin = {
  targetKind: LibraryPinTargetKind;
  targetId: string;
  pinnedAt: string;
};

export type CollectionUpsertPatch = {
  type: 'collection-upsert';
  collection: Collection;
};

export type CollectionDeletePatch = {
  type: 'collection-delete';
  collectionId: string;
};

export type CollectionMembersPatch = {
  type: 'collection-members';
  collectionId: string;
  members: CollectionMember[];
};

export type CollectionStorePatch =
  | CollectionUpsertPatch
  | CollectionDeletePatch
  | CollectionMembersPatch;

export type LibraryPinPatch = {
  type: 'library-pin';
  pin: LibraryPin;
  pinned: boolean;
};
