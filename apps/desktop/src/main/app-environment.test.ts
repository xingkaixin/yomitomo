import { describe, expect, it, vi } from 'vitest';

const appState = vi.hoisted(() => ({
  appData: '/tmp/yomitomo-app-data',
  isPackaged: false,
  paths: new Map<string, string>(),
}));

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: (name: string) => appState.paths.get(name) || appState.appData,
    setName: () => {},
    setPath: (name: string, value: string) => {
      appState.paths.set(name, value);
    },
  },
}));

import { configureDesktopAppStorage, getDesktopAppProfile } from './app/app-environment';

describe('desktop app environment', () => {
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
