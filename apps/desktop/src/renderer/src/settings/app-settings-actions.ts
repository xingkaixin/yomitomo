import type { YomitomoDesktopApi } from '../../../preload';

type SettingsDesktopApi = Pick<
  YomitomoDesktopApi,
  | 'deleteProvider'
  | 'getWeReadState'
  | 'listProviderModels'
  | 'openUrl'
  | 'readProviderApiKey'
  | 'readWeReadApiKey'
  | 'saveProvider'
  | 'saveSettings'
  | 'saveUser'
  | 'saveWeReadSettings'
  | 'setAppLockEnabled'
  | 'setAppLockPin'
  | 'testProvider'
  | 'testWeRead'
>;

export function createAppSettingsActions(getDesktop: () => SettingsDesktopApi) {
  return {
    deleteProvider: (id: Parameters<SettingsDesktopApi['deleteProvider']>[0]) =>
      getDesktop().deleteProvider(id),
    disableAppLock: (pin: string) => getDesktop().setAppLockEnabled({ enabled: false, pin }),
    enableAppLock: async (pin: string, confirmPin: string) => {
      const desktop = getDesktop();
      await desktop.setAppLockPin({ pin, confirmPin });
      return desktop.setAppLockEnabled({ enabled: true });
    },
    getWeReadState: () => getDesktop().getWeReadState(),
    listProviderModels: (provider: Parameters<SettingsDesktopApi['listProviderModels']>[0]) =>
      getDesktop().listProviderModels(provider),
    openExternalUrl: (url: string) => getDesktop().openUrl(url),
    readProviderApiKey: (providerId: string) => getDesktop().readProviderApiKey(providerId),
    readWeReadApiKey: () => getDesktop().readWeReadApiKey(),
    saveProvider: (provider: Parameters<SettingsDesktopApi['saveProvider']>[0]) =>
      getDesktop().saveProvider(provider),
    saveSettings: (settings: Parameters<SettingsDesktopApi['saveSettings']>[0]) =>
      getDesktop().saveSettings(settings),
    saveUser: (user: Parameters<SettingsDesktopApi['saveUser']>[0]) => getDesktop().saveUser(user),
    saveWeReadSettings: (input: Parameters<SettingsDesktopApi['saveWeReadSettings']>[0]) =>
      getDesktop().saveWeReadSettings(input),
    testProvider: (provider: Parameters<SettingsDesktopApi['testProvider']>[0]) =>
      getDesktop().testProvider(provider),
    testWeReadAndRefresh: async (apiKey?: string) => {
      const desktop = getDesktop();
      const result = await desktop.testWeRead(apiKey);
      const state = await desktop.getWeReadState();
      return { result, state };
    },
  };
}

export type AppSettingsActions = ReturnType<typeof createAppSettingsActions>;

export const appSettingsActions = createAppSettingsActions(() => window.yomitomoDesktop);
