import { createContext, useContext, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import type { SettingsStorePatch } from '../../../ipc-contract';
import {
  isAppLockSettingsLocked,
  lockedRendererStoreFromStatus,
  rendererStoreForAppLockState,
} from '../../../app-store';
import {
  desktopStoreLoadErrorInfo,
  type DesktopStoreLoadErrorInfo,
} from '../../../app-store-errors';
import { desktopIpcErrorCodes, isDesktopIpcErrorLike } from '../../../ipc-errors';

import { recordStartupTiming, rendererPerformanceElapsedMs } from './app-renderer-performance';
import {
  articleStorePatchCommit,
  createArticleStore,
  type ArticleStore,
} from './app-article-store';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
} from './app-library-collection-store-actions';
import { getDesktopApi } from './app-desktop-api';

export type SettingsSyncSnapshot = Pick<DesktopStore, 'user' | 'settings'>;

export type DesktopStoreState = {
  store: DesktopStore | null;
  loadError: DesktopStoreLoadErrorInfo | null;
  settingsSyncSnapshot: SettingsSyncSnapshot | null;
  libraryCatalogRevision: number;
  articleStore: ArticleStore;
  getStore: () => DesktopStore | null;
  applyStore: (nextStore: DesktopStore) => DesktopStore;
  applySettingsPatch: (patch: SettingsStorePatch) => DesktopStore;
  refreshStore: () => Promise<DesktopStore | null>;
  receiveStore: (nextStore: DesktopStore) => void;
  receiveArticlePatch: (patch: ArticleStorePatch) => void;
  receiveCollectionPatch: (patch: CollectionStorePatch) => void;
  receiveLibraryPinPatch: (patch: LibraryPinPatch) => void;
};

export type DesktopStoreApi = StoreApi<DesktopStoreState>;

export function createDesktopStore(): DesktopStoreApi {
  return createStore<DesktopStoreState>()((set, get) => {
    const getStore = () => get().store;

    function applyStore(nextStore: DesktopStore) {
      const rendererStore = rendererStoreForAppLockState(nextStore);
      set((state) => ({
        store: rendererStore,
        libraryCatalogRevision: libraryCatalogFactsChanged(state.store, rendererStore)
          ? state.libraryCatalogRevision + 1
          : state.libraryCatalogRevision,
      }));
      return rendererStore;
    }

    function receiveStore(nextStore: DesktopStore) {
      const rendererStore = applyStore(nextStore);
      set({ settingsSyncSnapshot: settingsSyncSnapshotFromStore(rendererStore), loadError: null });
    }

    function failLoad(loadError: DesktopStoreLoadErrorInfo) {
      set({ loadError, store: null });
    }

    async function refreshStore() {
      const desktop = getDesktopApi();
      const startedAt = performance.now();
      recordStartupTiming('store.refresh_start');

      try {
        const result = await desktop.store.getStateResult();
        if (!result.ok) {
          recordStartupTiming('store.refresh_error', {
            durationMs: rendererPerformanceElapsedMs(startedAt),
            code: result.error.code,
          });
          failLoad(result.error);
          return null;
        }

        const nextStore = result.store;
        recordStartupTiming('store.refresh_success', {
          durationMs: rendererPerformanceElapsedMs(startedAt),
          articleCount: nextStore.articles.length,
        });
        receiveStore(nextStore);
        return nextStore;
      } catch (error) {
        let refreshError = error;
        if (isDesktopIpcErrorLike(error) && error.code === desktopIpcErrorCodes.appLockRequired) {
          try {
            const nextStore = lockedRendererStoreFromStatus(await desktop.appLock.getStatus());
            receiveStore(nextStore);
            return nextStore;
          } catch (statusError) {
            refreshError = statusError;
          }
        }

        recordStartupTiming('store.refresh_exception', {
          durationMs: rendererPerformanceElapsedMs(startedAt),
        });
        failLoad(
          desktopStoreLoadErrorInfo(refreshError) || {
            code: 'DATABASE_UNAVAILABLE',
            detail: refreshError instanceof Error ? refreshError.message : undefined,
          },
        );
        return null;
      }
    }

    function applyUnlockedStorePatch(update: (store: DesktopStore) => DesktopStore) {
      const store = getStore();
      if (!store || isAppLockSettingsLocked(store.settings)) return;
      applyStore(update(store));
      set({ loadError: null });
    }

    const articleStore = createArticleStore({ getStore, applyStore });

    return {
      store: null,
      loadError: null,
      settingsSyncSnapshot: null,
      libraryCatalogRevision: 0,
      articleStore,
      getStore,
      applyStore,
      applySettingsPatch: (patch) => applyStore(applySettingsStorePatch(getStore(), patch)),
      refreshStore,
      receiveStore,
      receiveArticlePatch: (patch) => {
        if (articleStore.commit(articleStorePatchCommit(patch))) set({ loadError: null });
      },
      receiveCollectionPatch: (patch) =>
        applyUnlockedStorePatch((store) => applyCollectionStorePatch(store, patch)),
      receiveLibraryPinPatch: (patch) =>
        applyUnlockedStorePatch((store) => applyLibraryPinPatch(store, patch)),
    };
  });
}

const DesktopStoreContext = createContext<DesktopStoreApi | null>(null);

export function DesktopStoreProvider({
  store,
  children,
}: {
  store: DesktopStoreApi;
  children: ReactNode;
}) {
  return <DesktopStoreContext value={store}>{children}</DesktopStoreContext>;
}

export function useDesktopStoreApi() {
  const store = useContext(DesktopStoreContext);
  if (!store) throw new Error('DesktopStoreProvider is missing');
  return store;
}

export function useDesktopStore<T>(selector: (state: DesktopStoreState) => T) {
  return useStore(useDesktopStoreApi(), selector);
}

function libraryCatalogFactsChanged(current: DesktopStore | null, next: DesktopStore) {
  return (
    !current ||
    current.articles !== next.articles ||
    current.collectionMembers !== next.collectionMembers ||
    current.collections !== next.collections ||
    current.pins !== next.pins
  );
}

function settingsSyncSnapshotFromStore(store: DesktopStore): SettingsSyncSnapshot {
  return { user: store.user, settings: store.settings };
}

export function applySettingsStorePatch(
  store: DesktopStore | null,
  patch: SettingsStorePatch,
): DesktopStore {
  if (!store) throw new Error('Desktop store is not loaded');
  return { ...store, ...patch };
}
