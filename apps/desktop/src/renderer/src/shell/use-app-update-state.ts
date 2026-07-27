import { useEffect, useState } from 'react';
import type { AppUpdateState } from '../../../app-update-types';
import { getOptionalDesktopApi } from './app-desktop-api';

// 订阅主进程广播的更新状态：初始拉一次 + 后续事件增量更新。
// 自动检查与手动检查的命中都会落到这里，供常驻入口判定显示。
export function useAppUpdateState() {
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);

  useEffect(() => {
    const updates = getOptionalDesktopApi()?.updates;
    let mounted = true;
    if (updates?.getStatus) {
      void updates.getStatus().then((state) => {
        if (mounted) setUpdateState(state);
      });
    }
    const unsubscribe = updates?.onStatus?.((state) => {
      if (mounted) setUpdateState(state);
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return updateState;
}
