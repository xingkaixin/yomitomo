import type { CollectionStorePatch, DesktopStore, LibraryPinPatch } from '@yomitomo/shared';

export function applyCollectionStorePatch(
  store: DesktopStore,
  patch: CollectionStorePatch,
): DesktopStore {
  switch (patch.type) {
    case 'collection-upsert':
      return applyCollectionUpsertPatch(store, patch.collection);
    case 'collection-delete':
      return applyCollectionDeletePatch(store, patch.collectionId);
    case 'collection-members':
      return applyCollectionMembersPatch(store, patch.collectionId, patch.members);
  }
}

export function applyLibraryPinPatch(store: DesktopStore, patch: LibraryPinPatch): DesktopStore {
  const pins = store.pins.filter(
    (pin) => pin.targetKind !== patch.pin.targetKind || pin.targetId !== patch.pin.targetId,
  );
  return {
    ...store,
    pins: patch.pinned ? [patch.pin, ...pins] : pins,
  };
}

function applyCollectionUpsertPatch(
  store: DesktopStore,
  collection: DesktopStore['collections'][number],
): DesktopStore {
  const exists = store.collections.some((item) => item.id === collection.id);
  return {
    ...store,
    collections: exists
      ? store.collections.map((item) => (item.id === collection.id ? collection : item))
      : [collection, ...store.collections],
  };
}

function applyCollectionDeletePatch(store: DesktopStore, collectionId: string): DesktopStore {
  return {
    ...store,
    collections: store.collections.filter((collection) => collection.id !== collectionId),
    collectionMembers: store.collectionMembers.filter(
      (member) => member.collectionId !== collectionId,
    ),
    pins: store.pins.filter(
      (pin) => pin.targetKind !== 'collection' || pin.targetId !== collectionId,
    ),
  };
}

function applyCollectionMembersPatch(
  store: DesktopStore,
  collectionId: string,
  members: DesktopStore['collectionMembers'],
): DesktopStore {
  return {
    ...store,
    collectionMembers: [
      ...members,
      ...store.collectionMembers.filter((member) => member.collectionId !== collectionId),
    ],
  };
}
