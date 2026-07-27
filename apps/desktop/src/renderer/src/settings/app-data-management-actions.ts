import type { AppSettings } from '@yomitomo/shared';
import type { YomitomoDesktopApi } from '../../../preload';
import { getDesktopApi } from '../shell/app-desktop-api';

type DataManagementDesktopApi = Pick<YomitomoDesktopApi, 'store'>;

export function createDataManagementActions(getDesktop: () => DataManagementDesktopApi) {
  return {
    saveLogRetention: (settings: AppSettings, days: number) =>
      getDesktop().store.saveSettings({ ...settings, logRetentionDays: days }),
  };
}

export type DataManagementActions = ReturnType<typeof createDataManagementActions>;

export const dataManagementActions = createDataManagementActions(getDesktopApi);
