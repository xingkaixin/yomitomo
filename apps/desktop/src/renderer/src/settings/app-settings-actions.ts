import type { YomitomoDesktopApi } from '../../../preload';
import { getDesktopApi } from '../shell/app-desktop-api';

type SettingsDesktopApi = Pick<YomitomoDesktopApi, 'appLock' | 'weRead'>;

export function createAppSettingsActions(getDesktop: () => SettingsDesktopApi) {
  return {
    disableAppLock: (pin: string) => getDesktop().appLock.setEnabled({ enabled: false, pin }),
    enableAppLock: async (pin: string, confirmPin: string) => {
      const desktop = getDesktop();
      await desktop.appLock.setPin({ pin, confirmPin });
      return desktop.appLock.setEnabled({ enabled: true });
    },
    testWeReadAndRefresh: async (apiKey?: string) => {
      const desktop = getDesktop();
      const result = await desktop.weRead.test(apiKey);
      const state = await desktop.weRead.getState();
      return { result, state };
    },
  };
}

export type AppSettingsActions = ReturnType<typeof createAppSettingsActions>;

export const appSettingsActions = createAppSettingsActions(getDesktopApi);
