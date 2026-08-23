import type { YomitomoDesktopApi } from '../../../preload';
import { getDesktopApi } from '../shell/app-desktop-api';

type DataManagementDesktopApi = Pick<YomitomoDesktopApi, 'store'>;

export function createDataManagementActions(getDesktop: () => DataManagementDesktopApi) {
  return {
    saveLogRetention: (days: number) => getDesktop().store.saveSettings({ logRetentionDays: days }),
  };
}

export type DataManagementActions = ReturnType<typeof createDataManagementActions>;

export const dataManagementActions = createDataManagementActions(getDesktopApi);
