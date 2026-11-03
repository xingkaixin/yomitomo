// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, ArticleStorePatch, DesktopStore } from '@yomitomo/shared';

import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';
import { bindDesktopStoreEvents } from '../shell/app-desktop-event-bindings';
import { createDesktopStore } from '../shell/app-desktop-store';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('createDesktopStore', () => {
  it('loads a minimal locked store when main requires app lock before store access', async () => {
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        appLock: {
          getStatus: vi.fn().mockResolvedValue({
            configured: true,
            enabled: true,
            locked: true,
            shortcut: 'CommandOrControl+L',
          }),
        },
        store: {
          getStateResult: vi.fn().mockRejectedValue({
            code: 'APP_LOCK_REQUIRED',
            message: 'APP_LOCK_REQUIRED',
          }),
          onUpdated: vi.fn(() => vi.fn()),
        },
        article: {
          onPatched: vi.fn(() => vi.fn()),
        },
      },
    });

    const desktopStore = startDesktopStore();

    await vi.waitFor(() => expect(desktopStore.getState().store).not.toBeNull());
    expect(desktopStore.getState().store?.settings).toMatchObject({
      appLockEnabled: true,
      appLockLocked: true,
      appLockShortcut: 'CommandOrControl+L',
    });
    expect(desktopStore.getState().store?.articles).toEqual([]);
  });

  it('scrubs locked store updates and ignores article patches while locked', async () => {
    const initialArticle = articleSummary({ id: 'article_initial' });
    const initialStore = makeStore({
      articles: [initialArticle],
      settings: { appLockEnabled: true, appLockLocked: false },
    });
    const lockedStore = makeStore({
      articles: [articleSummary({ id: 'article_secret', title: '敏感文章' })],
      settings: { appLockEnabled: true, appLockLocked: true },
    });
    const unlockedArticle = articleSummary({ id: 'article_unlocked' });
    const unlockedStore = makeStore({
      articles: [unlockedArticle],
      settings: { appLockEnabled: true, appLockLocked: false },
    });
    let emitStoreUpdated = noopStoreUpdated;
    let emitArticlePatched = noopArticlePatched;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          getStateResult: vi.fn().mockResolvedValue({ ok: true, store: initialStore }),
          onUpdated: vi.fn((callback: (store: DesktopStore) => void) => {
            emitStoreUpdated = callback;
            return vi.fn();
          }),
        },
        article: {
          onPatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
            emitArticlePatched = callback;
            return vi.fn();
          }),
        },
      },
    });

    const desktopStore = startDesktopStore();

    await vi.waitFor(() => expect(desktopStore.getState().store).not.toBeNull());
    expect(desktopStore.getState().store?.articles).toEqual([initialArticle]);

    emitStoreUpdated(lockedStore);

    expect(desktopStore.getState().store?.settings).toMatchObject({
      appLockEnabled: true,
      appLockLocked: true,
    });
    expect(desktopStore.getState().store?.articles).toEqual([]);

    emitArticlePatched({
      type: 'article-upsert',
      article: articleSummary({ id: 'article_patch', title: '锁定期间 patch' }),
    });

    expect(desktopStore.getState().store?.articles).toEqual([]);

    emitStoreUpdated(unlockedStore);

    expect(desktopStore.getState().store?.articles).toEqual([unlockedArticle]);
  });
});

function noopStoreUpdated(_store: DesktopStore) {}
function noopArticlePatched(_patch: ArticleStorePatch) {}

function startDesktopStore() {
  const desktopStore = createDesktopStore();
  void desktopStore.getState().refreshStore();
  bindDesktopStoreEvents(desktopStore);
  return desktopStore;
}

function makeStore(
  input: {
    user?: Partial<DesktopStore['user']>;
    settings?: AppSettingsPatch;
    providers?: DesktopStore['providers'];
    agents?: DesktopStore['agents'];
    articles?: DesktopStore['articles'];
    collections?: DesktopStore['collections'];
    collectionMembers?: DesktopStore['collectionMembers'];
    pins?: DesktopStore['pins'];
  } = {},
): DesktopStore {
  return {
    user: { ...emptyStore.user, ...input.user },
    settings: normalizeAppSettings(input.settings),
    providers: input.providers || [],
    agents: input.agents || [],
    articles: input.articles || [],
    collections: input.collections || [],
    collectionMembers: input.collectionMembers || [],
    pins: input.pins || [],
  };
}

type WebArticleSummaryRecord = Extract<DesktopStore['articles'][number], { sourceType: 'web' }>;

function articleSummary(input: Partial<WebArticleSummaryRecord>): WebArticleSummaryRecord {
  return {
    id: input.id || 'article_1',
    title: input.title || '文章',
    url: input.url || '',
    canonicalUrl: input.canonicalUrl || input.url || '',
    excerpt: input.excerpt || '',
    byline: input.byline || '',
    siteName: input.siteName || '',
    contentHash: input.contentHash || 'hash',
    sourceType: 'web',
    readingProgress: input.readingProgress,
    counts: input.counts || {
      annotationCount: 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: 0,
    },
    createdAt: input.createdAt || '2026-06-15T00:00:00.000Z',
    updatedAt: input.updatedAt || '2026-06-15T00:00:00.000Z',
  };
}
