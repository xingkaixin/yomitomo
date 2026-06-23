import { useEffect, useState } from 'react';
import type { AppUpdateState } from '../../../app-update-types';

// 订阅主进程广播的更新状态：初始拉一次 + 后续事件增量更新。
// 自动检查与手动检查的命中都会落到这里，供常驻入口判定显示。
export function useAppUpdateState() {
  const [updateState, setUpdateState] = useState<AppUpdateState | null>(null);

  useEffect(() => {
    const desktop = window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined;
    let mounted = true;
    if (typeof desktop?.getUpdateStatus === 'function') {
      void desktop.getUpdateStatus().then((state) => {
        if (mounted) setUpdateState(state);
      });
    }
    const unsubscribe =
      typeof desktop?.onUpdateStatus === 'function'
        ? desktop.onUpdateStatus((state) => {
            if (mounted) setUpdateState(state);
          })
        : undefined;
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  return updateState;
}
