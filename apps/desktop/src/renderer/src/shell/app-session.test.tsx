// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ArticleSummaryRecord, DesktopStore, ResolvedAppSettings } from '@yomitomo/shared';
import type { AppMenuCommand } from '../../../app-menu-types';
import { emptyStore } from '../settings/app-settings';
import { createReaderThemeStore } from '../theme/use-reader-theme-controller';
import { bindMainWindowEvents } from './app-desktop-event-bindings';
import { createDesktopStore } from './app-desktop-store';
import { createAppQueryClient } from './app-query-client';
import {
  AppSessionStoreProvider,
  appNavigationReducer,
  createAppSessionStore,
  useAppSession,
  type AppSessionStoreApi,
} from './app-session';

const desktopApi = vi.hoisted(() => ({
  backupDatabase: vi.fn(async () => undefined),
  checkUpdates: vi.fn(async () => undefined),
  menuCommandListeners: new Set<(command: AppMenuCommand) => void>(),
  readStatsSummaries: vi.fn(async () => [] as ArticleSummaryRecord[]),
  restoreDatabase: vi.fn(async () => ({ canceled: true })),
  saveSettings: vi.fn(),
}));

vi.mock('./app-desktop-api', () => ({
  getDesktopApi: () => ({
    app: {
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
    store: { saveSettings: desktopApi.saveSettings },
    updates: { check: desktopApi.checkUpdates },
  }),
}));

vi.mock('./app-secondary-module-preload', () => ({
  preloadEntries: {
    agents: { status: 'not-started' },
    profileDialog: { status: 'not-started' },
    settingsAbout: { status: 'not-started' },
    settingsPanels: { status: 'not-started' },
    settingsProvider: { status: 'not-started' },
    stats: { status: 'not-started' },
  },
}));

vi.mock('./app-renderer-performance', () => ({
  rendererPerformanceElapsedMs: () => 0,
  recordStartupTiming: vi.fn(),
  recordStatsTiming: vi.fn(),
}));

vi.mock('../i18n/app-i18n', () => ({ changeAppI18nLanguage: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  desktopApi.menuCommandListeners.clear();
});

describe('app session store', () => {
  it('closes transient surfaces and drops cached reads when the app locks', async () => {
    const { desktopStore, queryClient, sessionStore } = startMainWindow();
    queryClient.setQueryData(['weread', 'settings'], { configured: true });
    const { actions } = sessionStore.getState();
    await actions.openStats();
    actions.openProfileDialog();
    actions.setThemeDialogOpen(true);
    actions.openEvidenceSource({ articleId: 'article_1' });
    actions.setReaderOpen(true);

    desktopStore.getState().applyStore(makeStore({ appLockEnabled: true, appLockLocked: true }));

    expect(sessionStore.getState()).toMatchObject({
      navigation: { pendingOpenArticle: null, readerOpen: false, surface: 'library' },
      profileDialogOpen: false,
      statsArticles: null,
      statsNavigationStartedAt: undefined,
      themeDialogOpen: false,
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('routes menu commands to their surface or desktop action', () => {
    const { sessionStore } = startMainWindow();

    emitMenuCommand('open-about');
    expect(sessionStore.getState()).toMatchObject({
      navigation: { surface: 'settings' },
      requestedSettingsSection: 'about',
    });

    emitMenuCommand('import-ebook');
    expect(sessionStore.getState()).toMatchObject({
      navigation: { surface: 'library' },
      menuRequest: { command: 'import-ebook', id: 1 },
    });

    emitMenuCommand('backup-database');
    expect(desktopApi.backupDatabase).toHaveBeenCalledTimes(1);

    emitMenuCommand('check-updates');
    expect(desktopApi.checkUpdates).toHaveBeenCalledTimes(1);
  });

  it('ignores menu commands while the app is locked', () => {
    startMainWindow(makeStore({ appLockEnabled: true, appLockLocked: true }));

    emitMenuCommand('backup-database');

    expect(desktopApi.backupDatabase).not.toHaveBeenCalled();
  });

  it('falls back to the store articles when the stats read fails', async () => {
    const articles = [{ id: 'article_1' }] as ArticleSummaryRecord[];
    desktopApi.readStatsSummaries.mockRejectedValueOnce(new Error('offline'));
    const { sessionStore } = startMainWindow({ ...emptyStore, articles });

    await sessionStore.getState().actions.openStats();

    expect(sessionStore.getState()).toMatchObject({
      navigation: { surface: 'stats' },
      statsArticles: articles,
    });
  });
});

describe('useAppSession', () => {
  it('keeps developer-only sections unreachable without developer mode', () => {
    const { desktopStore, sessionStore } = startMainWindow(
      makeStore({ developerModeEnabled: true }),
    );
    const { result, rerender } = renderSession(sessionStore, { developerModeEnabled: true });
    act(() => result.current.actions.openSettingsSection('aiTrace'));
    expect(result.current.settingsSection).toBe('aiTrace');

    act(() => {
      desktopStore.getState().applyStore(makeStore({ developerModeEnabled: false }));
    });
    rerender({ ...sessionInput, developerModeEnabled: false });
    expect(result.current.settingsSection).toBe('about');

    act(() => result.current.actions.changeSettingsSection('aiTrace'));
    expect(result.current.settingsSection).toBe('about');
  });

  it('keeps library query state while another surface is open', () => {
    const { sessionStore } = startMainWindow();
    const { result } = renderSession(sessionStore);
    act(() => {
      result.current.libraryQuery.dispatch({ type: 'query-changed', query: 'design' });
      result.current.actions.openSettings();
    });

    act(() => result.current.actions.openLibrary());

    expect(result.current.libraryQuery.state.searchQuery).toBe('design');
  });
});

describe('appNavigationReducer', () => {
  it('makes reader state representable only on the library surface', () => {
    const reading = appNavigationReducer(
      { pendingOpenArticle: null, readerOpen: false, surface: 'library' },
      { type: 'set-reader-open', open: true },
    );
    const settings = appNavigationReducer(reading, {
      type: 'open-surface',
      surface: 'settings',
    });

    expect(reading).toEqual({
      pendingOpenArticle: null,
      readerOpen: true,
      surface: 'library',
    });
    expect(settings).toEqual({ surface: 'settings' });
    expect(appNavigationReducer(settings, { type: 'set-reader-open', open: true })).toBe(settings);
    expect(appNavigationReducer(reading, { type: 'set-reader-open', open: true })).toBe(reading);
  });

  it('moves pending article navigation into the library state', () => {
    const opening = appNavigationReducer(
      { surface: 'reading-memory' },
      { type: 'open-article', target: { articleId: 'article_1', annotationId: 'annotation_1' } },
    );

    expect(opening).toEqual({
      pendingOpenArticle: { articleId: 'article_1', annotationId: 'annotation_1' },
      readerOpen: false,
      surface: 'library',
    });
    expect(appNavigationReducer(opening, { type: 'article-opened' })).toEqual({
      pendingOpenArticle: null,
      readerOpen: false,
      surface: 'library',
    });
  });
});

const sessionInput = {
  appLocked: false,
  developerModeEnabled: false,
  onboardingCompletedAt: '2026-06-29T00:00:00.000Z',
};

function startMainWindow(store: DesktopStore = emptyStore) {
  const desktopStore = createDesktopStore();
  desktopStore.getState().applyStore(store);
  const sessionStore = createAppSessionStore(desktopStore);
  const themeStore = createReaderThemeStore({ applyStore: desktopStore.getState().applyStore });
  const queryClient = createAppQueryClient();
  onTestFinished(bindMainWindowEvents({ desktopStore, queryClient, sessionStore, themeStore }));
  return { desktopStore, queryClient, sessionStore };
}

function renderSession(sessionStore: AppSessionStoreApi, input: Partial<typeof sessionInput> = {}) {
  return renderHook((props: typeof sessionInput) => useAppSession(props), {
    initialProps: { ...sessionInput, ...input },
    wrapper: ({ children }: { children: ReactNode }) => (
      <AppSessionStoreProvider store={sessionStore}>{children}</AppSessionStoreProvider>
    ),
  });
}

function makeStore(settings: Partial<ResolvedAppSettings>): DesktopStore {
  return { ...emptyStore, settings: { ...emptyStore.settings, ...settings } };
}

function emitMenuCommand(command: AppMenuCommand) {
  for (const listener of desktopApi.menuCommandListeners) listener(command);
}
