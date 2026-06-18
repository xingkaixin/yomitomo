// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopStore } from '@yomitomo/shared';
import { readDesktopReaderSettings } from '../settings/app-reader-settings';
import { emptyStore } from '../settings/app-settings';
import { inkBlackThemeId, themeRegistry } from '../theme/app-theme';
import {
  compatibleReaderBackgroundForTheme,
  useReaderThemeController,
} from '../theme/use-reader-theme-controller';

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
  it('keeps reader paper compatible when selecting a different theme tone', async () => {
    const nextStore = makeStore({ themeId: inkBlackThemeId });
    const applyStore = vi.fn();
    const latest: { current?: ReturnType<typeof useReaderThemeController> } = {};

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        saveSettings: vi.fn().mockResolvedValue(nextStore),
      },
    });

    render(
      <Harness
        applyStore={applyStore}
        latest={latest}
        settings={{ themeId: 'default' }}
        storeLoaded
      />,
    );

    await act(async () => {
      await latest.current?.selectTheme(inkBlackThemeId);
    });

    await waitFor(() =>
      expect(window.yomitomoDesktop.saveSettings).toHaveBeenCalledWith({
        themeId: inkBlackThemeId,
      }),
    );
    expect(readDesktopReaderSettings().backgroundColor).toBe(
      themeRegistry[inkBlackThemeId].reader.paper,
    );
    expect(screen.getByTestId('theme-id').textContent).toBe(inkBlackThemeId);
    expect(applyStore).toHaveBeenCalledWith(nextStore);
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
  storeLoaded = false,
}: {
  appLocked?: boolean;
  applyStore: (store: DesktopStore) => void;
  latest: { current?: ReturnType<typeof useReaderThemeController> };
  settings: DesktopStore['settings'];
  storeLoaded?: boolean;
}) {
  const controller = useReaderThemeController({
    appLocked,
    applyStore,
    settings,
    storeLoaded,
    storeLoadError: null,
  });
  latest.current = controller;

  return (
    <>
      <span data-testid="theme-id">{controller.activeThemeId}</span>
      <span data-testid="reader-background">{controller.readerBackgroundColor}</span>
    </>
  );
}

function makeStore(settings: DesktopStore['settings']): DesktopStore {
  return {
    ...emptyStore,
    settings,
  };
}
