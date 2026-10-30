import type { DesktopStoreApi } from './app-desktop-store';
import { getDesktopApi, getOptionalDesktopApi } from './app-desktop-api';

export function bindDesktopStoreEvents(desktopStore: DesktopStoreApi) {
  const { receiveStore, receiveArticlePatch, receiveCollectionPatch, receiveLibraryPinPatch } =
    desktopStore.getState();
  const desktop = getOptionalDesktopApi();
  const unsubscribes = [
    getDesktopApi().store.onUpdated(receiveStore),
    desktop?.article?.onPatched?.(receiveArticlePatch),
    desktop?.library?.collections?.onPatched?.(receiveCollectionPatch),
    desktop?.library?.pins?.onPatched?.(receiveLibraryPinPatch),
  ];
  return () => {
    for (const unsubscribe of unsubscribes) unsubscribe?.();
  };
}
