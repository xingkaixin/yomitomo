import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';
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
import { articleStorePatchCommit, useArticleStore } from './app-article-store';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
} from './app-library-collection-store-actions';
import { getDesktopApi, getOptionalDesktopApi } from './app-desktop-api';

export type SettingsSyncSnapshot = Pick<DesktopStore, 'user' | 'settings'>;

export function useDesktopStoreState() {
  const [store, setStore] = useState<DesktopStore | null>(null);
  const [storeLoadError, setStoreLoadError] = useState<DesktopStoreLoadErrorInfo | null>(null);
  const [settingsSyncSnapshot, setSettingsSyncSnapshot] = useState<SettingsSyncSnapshot | null>(
    null,
  );
  const storeRef = useRef<DesktopStore | null>(null);
  const libraryCatalogRevisionRef = useRef(0);

  const applyStore = useCallback((nextStore: DesktopStore) => {
    const rendererStore = rendererStoreForAppLockState(nextStore);
    if (libraryCatalogFactsChanged(storeRef.current, rendererStore)) {
      libraryCatalogRevisionRef.current += 1;
    }
    storeRef.current = rendererStore;
    setStore(rendererStore);
    return rendererStore;
  }, []);
  const articleStore = useArticleStore({ storeRef, applyStore });

  const applySettingsPatch = useCallback(
    (patch: SettingsStorePatch) => applyStore(applySettingsStorePatch(storeRef.current, patch)),
    [applyStore],
  );

  const refreshStore = useCallback(async () => {
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
        setStoreLoadError(result.error);
        storeRef.current = null;
        setStore(null);
        return null;
      }

      const nextStore = result.store;
      recordStartupTiming('store.refresh_success', {
        durationMs: rendererPerformanceElapsedMs(startedAt),
        articleCount: nextStore.articles.length,
      });
      const rendererStore = applyStore(nextStore);
      setSettingsSyncSnapshot(settingsSyncSnapshotFromStore(rendererStore));
      setStoreLoadError(null);
      return nextStore;
    } catch (error) {
      let refreshError = error;
      if (isDesktopIpcErrorLike(error) && error.code === desktopIpcErrorCodes.appLockRequired) {
        try {
          const nextStore = lockedRendererStoreFromStatus(await desktop.appLock.getStatus());
          const rendererStore = applyStore(nextStore);
          setSettingsSyncSnapshot(settingsSyncSnapshotFromStore(rendererStore));
          setStoreLoadError(null);
          return nextStore;
        } catch (statusError) {
          refreshError = statusError;
        }
      }

      recordStartupTiming('store.refresh_exception', {
        durationMs: rendererPerformanceElapsedMs(startedAt),
      });
      setStoreLoadError(
        desktopStoreLoadErrorInfo(refreshError) || {
          code: 'DATABASE_UNAVAILABLE',
          detail: refreshError instanceof Error ? refreshError.message : undefined,
        },
      );
      storeRef.current = null;
      setStore(null);
      return null;
    }
  }, [applyStore]);

  useEffect(() => {
    const desktop = getDesktopApi();

    void refreshStore();
    const offStoreUpdated = desktop.store.onUpdated((nextStore) => {
      const rendererStore = applyStore(nextStore);
      setSettingsSyncSnapshot(settingsSyncSnapshotFromStore(rendererStore));
      setStoreLoadError(null);
    });
    const optionalDesktop = getOptionalDesktopApi();
    const offArticlePatched =
      optionalDesktop?.article?.onPatched?.((patch) => {
        if (!articleStore.commit(articleStorePatchCommit(patch))) return;
        setStoreLoadError(null);
      }) || (() => undefined);
    const offCollectionPatched =
      optionalDesktop?.library?.collections?.onPatched?.((patch) => {
        const currentStore = storeRef.current;
        if (!currentStore || isAppLockSettingsLocked(currentStore.settings)) return;
        const nextStore = applyCollectionStorePatch(currentStore, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
      }) || (() => undefined);
    const offLibraryPinPatched =
      optionalDesktop?.library?.pins?.onPatched?.((patch) => {
        const currentStore = storeRef.current;
        if (!currentStore || isAppLockSettingsLocked(currentStore.settings)) return;
        const nextStore = applyLibraryPinPatch(currentStore, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
      }) || (() => undefined);
    return () => {
      offLibraryPinPatched();
      offCollectionPatched();
      offArticlePatched();
      offStoreUpdated();
    };
  }, [applyStore, articleStore, refreshStore]);

  const common = {
    storeRef,
    refreshStore,
    applyStore,
    applySettingsPatch,
    articleStore,
  };
  if (storeLoadError) {
    return { ...common, status: 'error' as const, error: storeLoadError };
  }
  if (!store) return { ...common, status: 'loading' as const };
  return {
    ...common,
    status: 'ready' as const,
    store,
    libraryCatalogRevision: libraryCatalogRevisionRef.current,
    settingsSyncSnapshot,
  };
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
