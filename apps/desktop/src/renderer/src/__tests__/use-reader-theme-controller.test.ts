// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { readDesktopReaderSettings } from '../settings/app-reader-settings';
import { emptyStore } from '../settings/app-settings';
import {
  inkBlackThemeId,
  inkPaperThemeId,
  shadLingoThemeId,
  shadLingoDarkThemeId,
  themeRegistry,
} from '../theme/app-theme';
import {
  compatibleReaderBackgroundForTheme,
  createReaderThemeStore,
} from '../theme/use-reader-theme-controller';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('createReaderThemeStore', () => {
  it.each([inkBlackThemeId, shadLingoDarkThemeId] as const)(
    'keeps reader paper compatible when selecting %s',
    async (themeId) => {
      const nextStore = makeStore({ themeId });
      const applyStore = vi.fn();
      stubSaveSettings(nextStore);
      const themeStore = createReaderThemeStore({ applyStore });
      themeStore.getState().syncFromSettings({ ...emptyStore.settings, themeId: 'default' });

      await themeStore.getState().selectTheme(themeId);

      expect(window.yomitomoDesktop.store.saveSettings).toHaveBeenCalledWith({ themeId });
      expect(readDesktopReaderSettings().backgroundColor).toBe(themeRegistry[themeId].reader.paper);
      expect(themeStore.getState().activeThemeId).toBe(themeId);
      expect(applyStore).toHaveBeenCalledWith(nextStore);
    },
  );

  it('preserves the explicitly previewed paper when changing the theme', async () => {
    stubSaveSettings(makeStore({ themeId: inkPaperThemeId }));
    const themeStore = createReaderThemeStore({ applyStore: vi.fn() });
    themeStore.getState().syncFromSettings({ ...emptyStore.settings, themeId: shadLingoThemeId });

    themeStore.getState().selectReaderBackground('#ffffff');
    await themeStore.getState().selectTheme(inkPaperThemeId, '#ffffff');

    expect(readDesktopReaderSettings().backgroundColor).toBe('#ffffff');
    expect(themeStore.getState().readerBackgroundColor).toBe('#ffffff');
  });

  it('computes compatible reader paper for theme changes without persistence', () => {
    expect(compatibleReaderBackgroundForTheme(inkBlackThemeId, '#fffdf8')).toBe(
      themeRegistry[inkBlackThemeId].reader.paper,
    );
  });
});

function stubSaveSettings(nextStore: DesktopStore) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: { store: { saveSettings: vi.fn().mockResolvedValue(nextStore) } },
  });
}

function makeStore(settings: AppSettingsPatch): DesktopStore {
  return {
    ...emptyStore,
    settings: normalizeAppSettings(settings),
  };
}
