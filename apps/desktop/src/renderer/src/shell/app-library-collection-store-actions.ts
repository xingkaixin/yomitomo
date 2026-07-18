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

type DesktopStoreRef = { current: DesktopStore };
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
      const nextStore = applyCollectionStorePatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );
  const applyPinPatch = useCallback(
    (patch: LibraryPinPatch) => {
      const nextStore = applyLibraryPinPatch(storeRef.current, patch);
      storeRef.current = nextStore;
      applyStore(nextStore);
    },
    [applyStore, storeRef],
  );

  const createCollection = useCallback(
    async (name: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop?.createCollection) throw collectionApiUnavailableError();
      const result = await desktop.createCollection({ name });
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
      const desktop = window.yomitomoDesktop;
      if (!desktop?.renameCollection) throw collectionApiUnavailableError();
      applyCollectionPatch(await desktop.renameCollection({ collectionId, name }));
      appToast.success(i18next.t('library.collection.renamedToast'), { description: name });
    },
    [applyCollectionPatch],
  );

  const deleteCollection = useCallback(
    async (collectionId: string) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop?.deleteCollection) throw collectionApiUnavailableError();
      applyCollectionPatch(await desktop.deleteCollection(collectionId));
      appToast.success(i18next.t('library.collection.deletedToast'));
    },
    [applyCollectionPatch],
  );

  const addCollectionMembers = useCallback(
    async (collectionId: string, members: ContentRef[]) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop?.addCollectionMembers) throw collectionApiUnavailableError();
      applyCollectionPatch(await desktop.addCollectionMembers({ collectionId, members }));
      appToast.success(
        i18next.t('library.collection.membersAddedToast', { count: members.length }),
      );
    },
    [applyCollectionPatch],
  );

  const removeCollectionMember = useCallback(
    async (collectionId: string, member: ContentRef) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop?.removeCollectionMember) throw collectionApiUnavailableError();
      applyCollectionPatch(await desktop.removeCollectionMember({ collectionId, member }));
      appToast.success(i18next.t('library.collection.memberRemovedToast'));
    },
    [applyCollectionPatch],
  );

  const setLibraryPin = useCallback(
    async (input: SetLibraryPinInput) => {
      const desktop = window.yomitomoDesktop;
      if (!desktop?.setLibraryPin) throw collectionApiUnavailableError();
      applyPinPatch(await desktop.setLibraryPin(input));
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

function collectionApiUnavailableError() {
  return new Error(i18next.t('library.collection.apiUnavailable'));
}
