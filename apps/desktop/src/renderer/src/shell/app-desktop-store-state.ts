import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';
import type { AppLockStatus } from '../../../ipc-contract';
import {
  desktopStoreLoadErrorInfo,
  type DesktopStoreLoadErrorInfo,
} from '../../../app-store-errors';
import { isDesktopIpcErrorLike } from '../../../ipc-errors';

import { emptyStore } from '../settings/app-settings';
import { applyArticleStorePatch } from './app-article-store-actions';
import {
  applyCollectionStorePatch,
  applyLibraryPinPatch,
} from './app-library-collection-store-actions';

export function useDesktopStoreState() {
  const [store, setStore] = useState<DesktopStore>(emptyStore);
  const [storeLoaded, setStoreLoaded] = useState(false);
  const [storeLoadError, setStoreLoadError] = useState<DesktopStoreLoadErrorInfo | null>(null);
  const [storeSyncSnapshot, setStoreSyncSnapshot] = useState<DesktopStore | null>(null);
  const storeRef = useRef<DesktopStore>(emptyStore);

  const applyStore = useCallback((nextStore: DesktopStore) => {
    storeRef.current = nextStore;
    setStore(nextStore);
    return nextStore;
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
      applyStore(nextStore);
      setStoreSyncSnapshot(nextStore);
      setStoreLoadError(null);
      setStoreLoaded(true);
      return nextStore;
    } catch (error) {
      let refreshError = error;
      if (isDesktopIpcErrorLike(error) && error.code === 'APP_LOCK_REQUIRED') {
        try {
          const nextStore = lockedStoreFromStatus(await desktop.getAppLockStatus());
          applyStore(nextStore);
          setStoreSyncSnapshot(nextStore);
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
      applyStore(nextStore);
      setStoreSyncSnapshot(nextStore);
      setStoreLoadError(null);
      setStoreLoaded(true);
    });
    const offArticlePatched =
      desktop.onArticlePatched?.((patch) => {
        const nextStore = applyArticleStorePatch(storeRef.current, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
        setStoreLoaded(true);
      }) || (() => undefined);
    const offCollectionPatched =
      desktop.onCollectionPatched?.((patch) => {
        const nextStore = applyCollectionStorePatch(storeRef.current, patch);
        applyStore(nextStore);
        setStoreLoadError(null);
        setStoreLoaded(true);
      }) || (() => undefined);
    const offLibraryPinPatched =
      desktop.onLibraryPinPatched?.((patch) => {
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

function lockedStoreFromStatus(status: AppLockStatus): DesktopStore {
  return {
    ...emptyStore,
    settings: {
      ...emptyStore.settings,
      appLockEnabled: status.enabled,
      appLockLocked: status.locked,
      appLockShortcut: status.shortcut,
    },
  };
}

function recordStartupTiming(event: string, data: Record<string, unknown> = {}) {
  const desktop = window.yomitomoDesktop;
  if (!desktop?.recordPerformanceTiming) return;
  void desktop
    .recordPerformanceTiming({
      event: `startup.${event}`,
      data: {
        rendererElapsedMs: elapsedMs(0),
        ...data,
      },
    })
    .catch(() => undefined);
}

function elapsedMs(startedAt: number) {
  return Number((performance.now() - startedAt).toFixed(2));
}
