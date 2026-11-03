// @vitest-environment jsdom

import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import type { ArticleSummaryRecord, DesktopStore, ResolvedAppSettings } from '@yomitomo/shared';
import type { AppMenuCommand } from '../../../app-menu-types';
import { emptyStore } from '../settings/app-settings';
import { createReaderThemeStore } from '../theme/use-reader-theme-controller';
import { bindMainWindowEvents } from './app-desktop-event-bindings';
import { createDesktopStore } from './app-desktop-store';
import { createAppQueryClient } from './app-query-client';
import { createAppSessionStore } from './app-session';

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
    updates: { check: desktopApi.checkUpdates, onStatus: () => () => undefined },
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
});

function startMainWindow(store: DesktopStore = emptyStore) {
  const desktopStore = createDesktopStore();
  desktopStore.getState().applyStore(store);
  const sessionStore = createAppSessionStore(desktopStore);
  const themeStore = createReaderThemeStore({ applyStore: desktopStore.getState().applyStore });
  const queryClient = createAppQueryClient();
  onTestFinished(bindMainWindowEvents({ desktopStore, queryClient, sessionStore, themeStore }));
  return { desktopStore, queryClient, sessionStore };
}

function makeStore(settings: Partial<ResolvedAppSettings>): DesktopStore {
  return { ...emptyStore, settings: { ...emptyStore.settings, ...settings } };
}
