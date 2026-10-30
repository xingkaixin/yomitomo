import { queryOptions, useQuery } from '@tanstack/react-query';
import type { AppUpdateState } from '../../../app-update-types';
import { getOptionalDesktopApi } from './app-desktop-api';

// 主进程广播的更新状态：初始拉一次，后续广播由 bindMainWindowEvents 写入同一缓存。
// 自动检查与手动检查的命中都会落到这里，供常驻入口判定显示。
export const appUpdateStateQuery = queryOptions({
  queryKey: ['updates', 'status'],
  queryFn: async (): Promise<AppUpdateState | null> =>
    (await getOptionalDesktopApi()?.updates?.getStatus?.()) ?? null,
});

export function useAppUpdateState() {
  return useQuery(appUpdateStateQuery).data ?? null;
}
