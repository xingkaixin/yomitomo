import { describe, expect, it, vi } from 'vitest';

const appState = vi.hoisted(() => ({
  appData: '/tmp/yomitomo-app-data',
  isPackaged: false,
  name: '',
  paths: new Map<string, string>(),
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: (name: string) => appState.paths.get(name) || appState.appData,
    setName: (name: string) => {
      appState.name = name;
    },
    setPath: (name: string, value: string) => {
      appState.paths.set(name, value);
    },
  },
}));

import { configureDesktopAppStorage, getDesktopAppProfile } from './app/app-environment';

describe('desktop app environment', () => {
  it('uses isolated resources in development', () => {
    appState.isPackaged = false;
    appState.paths.clear();

    configureDesktopAppStorage();

    expect(getDesktopAppProfile()).toMatchObject({
      environment: 'development',
      keychainService: 'app.yomitomo.desktop.dev',
      userDataDirectory: '@yomitomo/desktop-dev',
    });
    expect(appState.name).toBe('Yomitomo');
    expect(appState.paths.get('userData')).toBe('/tmp/yomitomo-app-data/@yomitomo/desktop-dev');
  });

  it('keeps production resources unchanged when packaged', () => {
    appState.isPackaged = true;
    appState.paths.clear();

    configureDesktopAppStorage();

    expect(getDesktopAppProfile()).toMatchObject({
      environment: 'production',
      keychainService: 'app.yomitomo.desktop',
      userDataDirectory: '@yomitomo/desktop',
    });
    expect(appState.paths.get('userData')).toBe('/tmp/yomitomo-app-data/@yomitomo/desktop');
  });
});
