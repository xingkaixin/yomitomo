// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import { inkBlackThemeId, inkPaperThemeId } from '../theme/app-theme';
import { createReaderThemeStore } from '../theme/use-reader-theme-controller';

afterEach(() => {
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

it('keeps the latest theme when an earlier theme save resolves after a newer selection', async () => {
  const pendingSaves: Array<(store: DesktopStore) => void> = [];
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: {
      store: {
        saveSettings: vi.fn(
          () => new Promise<DesktopStore>((resolve) => pendingSaves.push(resolve)),
        ),
      },
    },
  });
  const themeStore = createReaderThemeStore({
    applyStore: (store) => themeStore.getState().syncFromSettings(store.settings),
  });
  const storeWithTheme = (themeId: string): DesktopStore => ({
    ...emptyStore,
    settings: { ...emptyStore.settings, themeId },
  });

  const firstSave = themeStore.getState().selectTheme(inkPaperThemeId);
  const secondSave = themeStore.getState().selectTheme(inkBlackThemeId);

  pendingSaves[0](storeWithTheme(inkPaperThemeId));
  await firstSave;
  expect(themeStore.getState().activeThemeId).toBe(inkBlackThemeId);

  pendingSaves[1](storeWithTheme(inkBlackThemeId));
  await secondSave;
  expect(themeStore.getState().activeThemeId).toBe(inkBlackThemeId);
});
