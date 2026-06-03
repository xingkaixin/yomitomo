import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';
import {
  desktopStoreLoadErrorInfo,
  type DesktopStoreLoadErrorInfo,
} from '../../../app-store-errors';

import { emptyStore } from '../settings/app-settings';

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
      recordStartupTiming('store.refresh_exception', { durationMs: elapsedMs(startedAt) });
      setStoreLoadError(
        desktopStoreLoadErrorInfo(error) || {
          code: 'DATABASE_UNAVAILABLE',
          message: error instanceof Error ? error.message : '本地数据库加载失败。',
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
    return () => {
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
