// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleSummaryRecord, DesktopStore } from '@yomitomo/shared';
import type { AppMenuCommand } from '../../../app-menu-types';
import { useAppSession, type AppSessionInput } from './app-session';

const desktopApi = vi.hoisted(() => ({
  backupDatabase: vi.fn(async () => undefined),
  checkUpdates: vi.fn(async () => undefined),
  menuCommandListeners: new Set<(command: AppMenuCommand) => void>(),
  readStatsSummaries: vi.fn(async () => [] as ArticleSummaryRecord[]),
  restoreDatabase: vi.fn(
    async () => ({ canceled: true }) as { canceled: boolean; store?: unknown },
  ),
  showMainWindow: vi.fn(),
}));

const preload = vi.hoisted(() => ({
  cancelIdlePreload: vi.fn(),
  preloadIdleModules: vi.fn(),
  scheduleIdlePreload: vi.fn((run: () => void) => {
    run();
    return 1;
  }),
}));

vi.mock('./app-desktop-api', () => ({
  getDesktopApi: () => ({
    app: {
      showMainWindow: desktopApi.showMainWindow,
      onMenuCommand: (callback: (command: AppMenuCommand) => void) => {
        desktopApi.menuCommandListeners.add(callback);
        return () => desktopApi.menuCommandListeners.delete(callback);
      },
    },
    article: { readStatsSummaries: desktopApi.readStatsSummaries },
    data: {
      backupDatabase: desktopApi.backupDatabase,
      restoreDatabase: desktopApi.restoreDatabase,
    },
    updates: { check: desktopApi.checkUpdates },
  }),
}));

vi.mock('./app-secondary-module-preload', () => ({
  cancelIdlePreload: preload.cancelIdlePreload,
  preloadIdleModules: preload.preloadIdleModules,
  scheduleIdlePreload: preload.scheduleIdlePreload,
  preloadEntries: {
    agents: { status: 'not-started' },
    profileDialog: { status: 'not-started' },
    settingsAbout: { status: 'not-started' },
    settingsPanels: { status: 'not-started' },
    settingsProvider: { status: 'not-started' },
    stats: { status: 'not-started' },
  },
}));

vi.mock('./app-utils', () => ({
  elapsedMs: () => 0,
  recordStartupTiming: vi.fn(),
  recordStatsTiming: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  desktopApi.menuCommandListeners.clear();
});

describe('useAppSession', () => {
  it('requests the main window once, even as store facts change', () => {
    const { rerender } = renderSession({ storeLoaded: false });

    rerender({ storeLoaded: true });
    rerender({ storeLoaded: true, appLocked: true });

    expect(desktopApi.showMainWindow).toHaveBeenCalledTimes(1);
  });

  it('schedules the idle preload once the store is ready and onboarding is done', () => {
    const { rerender } = renderSession({ storeLoaded: false });
    expect(preload.preloadIdleModules).not.toHaveBeenCalled();

    rerender({ storeLoaded: true });

    expect(preload.preloadIdleModules).toHaveBeenCalledTimes(1);
  });

  it('does not preload while onboarding is still showing', () => {
    renderSession({ storeLoaded: true, onboardingCompletedAt: undefined });

    expect(preload.preloadIdleModules).not.toHaveBeenCalled();
  });

  it('closes transient surfaces when the app locks', async () => {
    const { result, rerender } = renderSession({ storeLoaded: true });
    act(() => result.current.actions.openProfileDialog());
    act(() => result.current.actions.setThemeDialogOpen(true));
    act(() => result.current.actions.setReaderOpen(true));
    act(() => result.current.actions.openArticleFromDistillation({ articleId: 'article_1' }));
    await act(async () => result.current.actions.openStats());

    rerender({ storeLoaded: true, appLocked: true });

    expect(result.current).toMatchObject({
      pendingOpenArticle: null,
      profileDialogOpen: false,
      readerOpen: false,
      statsArticles: null,
      statsNavigationStartedAt: undefined,
      themeDialogOpen: false,
    });
  });

  it('routes menu commands to their surface or desktop action', () => {
    const { result } = renderSession({ storeLoaded: true });

    act(() => emitMenuCommand('open-about'));
    expect(result.current).toMatchObject({ surface: 'settings', settingsSection: 'about' });

    act(() => emitMenuCommand('import-ebook'));
    expect(result.current.surface).toBe('library');
    expect(result.current.menuRequest).toMatchObject({ command: 'import-ebook', id: 1 });

    act(() => emitMenuCommand('backup-database'));
    expect(desktopApi.backupDatabase).toHaveBeenCalledTimes(1);

    act(() => emitMenuCommand('check-updates'));
    expect(desktopApi.checkUpdates).toHaveBeenCalledTimes(1);
  });

  it('ignores menu commands while the app is locked', () => {
    renderSession({ storeLoaded: true, appLocked: true });

    act(() => emitMenuCommand('backup-database'));

    expect(desktopApi.backupDatabase).not.toHaveBeenCalled();
  });

  it('keeps developer-only sections unreachable without developer mode', () => {
    const { result, rerender } = renderSession({ storeLoaded: true, developerModeEnabled: true });
    act(() => result.current.actions.openSettingsSection('aiTrace'));
    expect(result.current.settingsSection).toBe('aiTrace');

    rerender({ storeLoaded: true, developerModeEnabled: false });
    expect(result.current.settingsSection).toBe('about');

    act(() => result.current.actions.changeSettingsSection('aiTrace'));
    expect(result.current.settingsSection).toBe('about');
  });

  it('falls back to the store articles when the stats read fails', async () => {
    const articles = [{ id: 'article_1' }] as ArticleSummaryRecord[];
    desktopApi.readStatsSummaries.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderSession({ storeLoaded: true, articles });

    await act(async () => result.current.actions.openStats());

    expect(result.current.surface).toBe('stats');
    expect(result.current.statsArticles).toEqual(articles);
  });

  it('closes the reader when navigating away from the library', () => {
    const { result } = renderSession({ storeLoaded: true });
    act(() => result.current.actions.setReaderOpen(true));

    act(() => result.current.actions.openSettings());

    expect(result.current.readerOpen).toBe(false);
  });
});

function emitMenuCommand(command: AppMenuCommand) {
  for (const listener of desktopApi.menuCommandListeners) listener(command);
}

function renderSession(overrides: Partial<AppSessionInput> = {}) {
  const props = () => sessionInput(overrides);
  const hook = renderHook((input: AppSessionInput) => useAppSession(input), {
    initialProps: props(),
  });
  return {
    result: hook.result,
    rerender: (next: Partial<AppSessionInput>) => hook.rerender(sessionInput(next)),
  };
}

function sessionInput(overrides: Partial<AppSessionInput>): AppSessionInput {
  return {
    appLocked: false,
    applyStore: vi.fn() as unknown as (store: DesktopStore) => void,
    articles: [],
    developerModeEnabled: false,
    onboardingCompletedAt: '2026-06-29T00:00:00.000Z',
    readStatsArticles: desktopApi.readStatsSummaries,
    storeLoaded: true,
    storeLoadFailed: false,
    ...overrides,
  };
}
