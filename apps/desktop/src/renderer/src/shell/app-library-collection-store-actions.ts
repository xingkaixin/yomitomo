import { useCallback } from 'react';
import i18next from 'i18next';
import type {
  CollectionStorePatch,
  ContentRef,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import type { SetLibraryPinInput } from '../../../ipc-contract';
import { appToast } from './app-toast';
import { getDesktopApi } from './app-desktop-api';

type DesktopStoreRef = { current: DesktopStore | null };
type ApplyStore = (nextStore: DesktopStore) => DesktopStore;

type UseAppCollectionStoreActionsInput = {
  storeRef: DesktopStoreRef;
  applyStore: ApplyStore;
};

export function useAppCollectionStoreActions({
  storeRef,
  applyStore,
}: UseAppCollectionStoreActionsInput) {
  const applyCollectionPatch = useCallback(
    (patch: CollectionStorePatch) => {
      const store = requireDesktopStore(storeRef.current);
      const nextStore = applyCollectionStorePatch(store, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );
  const applyPinPatch = useCallback(
    (patch: LibraryPinPatch) => {
      const store = requireDesktopStore(storeRef.current);
      const nextStore = applyLibraryPinPatch(store, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const createCollection = useCallback(
    async (name: string) => {
      const result = await getDesktopApi().library.collections.create({ name });
      applyCollectionPatch(result.patch);
      appToast.success(i18next.t('library.collection.createdToast'), {
        description: result.collection.name,
      });
      return result.collection;
    },
    [applyCollectionPatch],
  );

  const renameCollection = useCallback(
    async (collectionId: string, name: string) => {
      applyCollectionPatch(
        await getDesktopApi().library.collections.rename({ collectionId, name }),
      );
      appToast.success(i18next.t('library.collection.renamedToast'), { description: name });
    },
    [applyCollectionPatch],
  );

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      applyCollectionPatch(await getDesktopApi().library.collections.delete(collectionId));
      appToast.success(i18next.t('library.collection.deletedToast'));
    },
    [applyCollectionPatch],
  );

  const addCollectionMembers = useCallback(
    async (collectionId: string, members: ContentRef[]) => {
      applyCollectionPatch(
        await getDesktopApi().library.collections.addMembers({ collectionId, members }),
      );
      appToast.success(
        i18next.t('library.collection.membersAddedToast', { count: members.length }),
      );
    },
    [applyCollectionPatch],
  );

  const removeCollectionMember = useCallback(
    async (collectionId: string, member: ContentRef) => {
      applyCollectionPatch(
        await getDesktopApi().library.collections.removeMember({ collectionId, member }),
      );
      appToast.success(i18next.t('library.collection.memberRemovedToast'));
    },
    [applyCollectionPatch],
  );

  const setLibraryPin = useCallback(
    async (input: SetLibraryPinInput) => {
      applyPinPatch(await getDesktopApi().library.pins.set(input));
    },
    [applyPinPatch],
  );

  return {
    addCollectionMembers,
    createCollection,
    deleteCollection,
    removeCollectionMember,
    renameCollection,
    setLibraryPin,
  };
}

function requireDesktopStore(store: DesktopStore | null) {
  if (!store) throw new Error('Desktop store is not loaded');
  return store;
}

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
