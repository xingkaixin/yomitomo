import { useCallback, useEffect, useRef, useState } from 'react';
import type { DesktopStore } from '@yomitomo/shared';

import { emptyStore } from './app-settings';

export function useDesktopStoreState() {
  const [store, setStore] = useState<DesktopStore>(emptyStore);
  const [storeLoaded, setStoreLoaded] = useState(false);
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

    const nextStore = await desktop.getState();
    applyStore(nextStore);
    setStoreSyncSnapshot(nextStore);
    setStoreLoaded(true);
    return nextStore;
  }, [applyStore]);

  useEffect(() => {
    const desktop = window.yomitomoDesktop;
    if (!desktop) return;

    void refreshStore();
    const offStoreUpdated = desktop.onStoreUpdated((nextStore) => {
      applyStore(nextStore);
      setStoreSyncSnapshot(nextStore);
      setStoreLoaded(true);
    });
    return () => {
      offStoreUpdated();
    };
  }, [applyStore, refreshStore]);

  return { store, storeLoaded, storeSyncSnapshot, storeRef, refreshStore, applyStore };
}
