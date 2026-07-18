import type { AppSettings } from '@yomitomo/shared';
import type { YomitomoDesktopApi } from '../../../preload';

type DataManagementDesktopApi = Pick<
  YomitomoDesktopApi,
  | 'backupDatabase'
  | 'clearLog'
  | 'getDataManagementPaths'
  | 'openDataManagementPath'
  | 'restoreDatabase'
  | 'saveSettings'
>;

export function createDataManagementActions(getDesktop: () => DataManagementDesktopApi) {
  return {
    backupDatabase: () => getDesktop().backupDatabase(),
    clearLog: () => getDesktop().clearLog(),
    getPaths: () => getDesktop().getDataManagementPaths(),
    openPath: (kind: Parameters<DataManagementDesktopApi['openDataManagementPath']>[0]) =>
      getDesktop().openDataManagementPath(kind),
    restoreDatabase: () => getDesktop().restoreDatabase(),
    saveLogRetention: (settings: AppSettings, days: number) =>
      getDesktop().saveSettings({ ...settings, logRetentionDays: days }),
  };
}

export type DataManagementActions = ReturnType<typeof createDataManagementActions>;

export const dataManagementActions = createDataManagementActions(() => window.yomitomoDesktop);
