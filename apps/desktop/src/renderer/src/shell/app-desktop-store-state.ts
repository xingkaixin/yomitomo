import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';
import {
  emptyDesktopStore,
  isAppLockSettingsLocked,
  lockedRendererStoreFromStatus,
  rendererStoreForAppLockState,
} from '../../../app-store';
import {
  desktopStoreLoadErrorInfo,
  type DesktopStoreLoadErrorInfo,
} from '../../../app-store-errors';
import { isDesktopIpcErrorLike } from '../../../ipc-errors';

import { elapsedMs, recordStartupTiming } from './app-utils';
import { applyArticleStorePatch } from './app-article-store-actions';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
} from './app-library-collection-store-actions';

export function useDesktopStoreState() {
  const [store, setStore] = useState<DesktopStore>(emptyDesktopStore);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [storeLoadError, setStoreLoadError] = useState<DesktopStoreLoadErrorInfo | null>(null);
  const [storeSyncSnapshot, setStoreSyncSnapshot] = useState<DesktopStore | null>(null);
  const storeRef = useRef<DesktopStore>(emptyDesktopStore);

  const applyStore = useCallback((nextStore: DesktopStore) => {
    const rendererStore = rendererStoreForAppLockState(nextStore);
    storeRef.current = rendererStore;
    setStore(rendererStore);
    return rendererStore;
  }, []);

  const refreshStore = useCallback(async () => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return null;
    const startedAt = performance.now();
    recordStartupTiming('store.refresh_start');

    try {
      const result = await desktop.getStateResult();
      if (!result.ok) {
        recordStartupTiming('store.refresh_error', {
          durationMs: elapsedMs(startedAt),
          code: result.error.code,
        });
        setStoreLoadError(result.error);
        setStoreLoaded(false);
        return null;
      }

      const nextStore = result.store;
      recordStartupTiming('store.refresh_success', {
        durationMs: elapsedMs(startedAt),
        articleCount: nextStore.articles.length,
      });
      const rendererStore = applyStore(nextStore);
      setStoreSyncSnapshot(rendererStore);
      setStoreLoadError(null);
      setStoreLoaded(true);
      return nextStore;
    } catch (error) {
      let refreshError = error;
      if (isDesktopIpcErrorLike(error) && error.code === 'APP_LOCK_REQUIRED') {
        try {
          const nextStore = lockedRendererStoreFromStatus(await desktop.getAppLockStatus());
          const rendererStore = applyStore(nextStore);
          setStoreSyncSnapshot(rendererStore);
          setStoreLoadError(null);
          setStoreLoaded(true);
          return nextStore;
        } catch (statusError) {
          refreshError = statusError;
        }
      }

      recordStartupTiming('store.refresh_exception', { durationMs: elapsedMs(startedAt) });
      setStoreLoadError(
        desktopStoreLoadErrorInfo(refreshError) || {
          code: 'DATABASE_UNAVAILABLE',
          detail: refreshError instanceof Error ? refreshError.message : undefined,
        },
      );
      setStoreLoaded(false);
      return null;
    }
  }, [applyStore]);

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    void refreshStore();
    const offStoreUpdated = desktop.onStoreUpdated((nextStore) => {
      const rendererStore = applyStore(nextStore);
      setStoreSyncSnapshot(rendererStore);
      setStoreLoadError(null);
      setStoreLoaded(true);
    });
    const offArticlePatched =
      desktop.onArticlePatched?.((patch) => {
        if (isAppLockSettingsLocked(storeRef.current.settings)) return;
        const nextStore = applyArticleStorePatch(storeRef.current, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
        setStoreLoaded(true);
      }) || (() => undefined);
    const offCollectionPatched =
      desktop.onCollectionPatched?.((patch) => {
        if (isAppLockSettingsLocked(storeRef.current.settings)) return;
        const nextStore = applyCollectionStorePatch(storeRef.current, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
        setStoreLoaded(true);
      }) || (() => undefined);
    const offLibraryPinPatched =
      desktop.onLibraryPinPatched?.((patch) => {
        if (isAppLockSettingsLocked(storeRef.current.settings)) return;
        const nextStore = applyLibraryPinPatch(storeRef.current, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
        setStoreLoaded(true);
      }) || (() => undefined);
    return () => {
      offLibraryPinPatched();
      offCollectionPatched();
      offArticlePatched();
      offStoreUpdated();
    };
  }, [applyStore, refreshStore]);

  return {
    store,
    storeLoaded,
    storeLoadError,
    storeSyncSnapshot,
    storeRef,
    refreshStore,
    applyStore,
  };
}
