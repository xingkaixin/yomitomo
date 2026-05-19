import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';
import { desktopStoreLoadErrorInfo, type DesktopStoreLoadErrorInfo } from '../../app-store-errors';

import { emptyStore } from './app-settings';

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

    try {
      const result = await desktop.getStateResult();
      if (!result.ok) {
        setStoreLoadError(result.error);
        setStoreLoaded(false);
        return null;
      }

      const nextStore = result.store;
      applyStore(nextStore);
      setStoreSyncSnapshot(nextStore);
      setStoreLoadError(null);
      setStoreLoaded(true);
      return nextStore;
    } catch (error) {
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
