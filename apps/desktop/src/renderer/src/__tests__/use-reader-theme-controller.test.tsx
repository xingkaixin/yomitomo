// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  useReaderThemeController,
} from '../theme/use-reader-theme-controller';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('useReaderThemeController', () => {
  it.each([inkBlackThemeId, shadLingoDarkThemeId] as const)(
    'keeps reader paper compatible when selecting %s',
    async (themeId) => {
      const nextStore = makeStore({ themeId });
      const applyStore = vi.fn();
      const latest: { current?: ReturnType<typeof useReaderThemeController> } = {};

      Object.defineProperty(window, 'yomitomoDesktop', {
        configurable: true,
        value: {
          store: {
            saveSettings: vi.fn().mockResolvedValue(nextStore),
          },
        },
      });

      render(
        <Harness
          applyStore={applyStore}
          latest={latest}
          settings={{ ...emptyStore.settings, themeId: 'default' }}
        />,
      );

      await act(async () => {
        await latest.current?.selectTheme(themeId);
      });

      await waitFor(() =>
        expect(window.yomitomoDesktop.store.saveSettings).toHaveBeenCalledWith({
          themeId,
        }),
      );
      expect(readDesktopReaderSettings().backgroundColor).toBe(themeRegistry[themeId].reader.paper);
      expect(screen.getByTestId('theme-id').textContent).toBe(themeId);
      expect(applyStore).toHaveBeenCalledWith(nextStore);
    },
  );

  it('preserves the explicitly previewed paper when changing the theme', async () => {
    const latest: { current?: ReturnType<typeof useReaderThemeController> } = {};
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: { saveSettings: vi.fn().mockResolvedValue(makeStore({ themeId: inkPaperThemeId })) },
      },
    });
    render(
      <Harness
        applyStore={vi.fn()}
        latest={latest}
        settings={{ ...emptyStore.settings, themeId: shadLingoThemeId }}
      />,
    );
    await act(async () => {
      latest.current?.selectReaderBackground('#ffffff');
    });
    await act(async () => {
      await latest.current?.selectTheme(inkPaperThemeId, '#ffffff');
    });
    expect(readDesktopReaderSettings().backgroundColor).toBe('#ffffff');
    expect(screen.getByTestId('reader-background').textContent).toBe('#ffffff');
  });

  it('computes compatible reader paper for theme changes without persistence', () => {
    expect(compatibleReaderBackgroundForTheme(inkBlackThemeId, '#fffdf8')).toBe(
      themeRegistry[inkBlackThemeId].reader.paper,
    );
  });
});

function Harness({
  appLocked = false,
  applyStore,
  latest,
  settings,
}: {
  appLocked?: boolean;
  applyStore: (store: DesktopStore) => void;
  latest: { current?: ReturnType<typeof useReaderThemeController> };
  settings: DesktopStore['settings'];
}) {
  const controller = useReaderThemeController({
    appLocked,
    applyStore,
    settings,
  });
  latest.current = controller;

  return (
    <>
      <span data-testid="theme-id">{controller.activeThemeId}</span>
      <span data-testid="reader-background">{controller.readerBackgroundColor}</span>
    </>
  );
}

function makeStore(settings: AppSettingsPatch): DesktopStore {
  return {
    ...emptyStore,
    settings: normalizeAppSettings(settings),
  };
}
