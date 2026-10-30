// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AppSettingsPatch,
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';

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
  it('does not expose a desktop store before loading completes', () => {
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          getStateResult: vi.fn(() => new Promise(() => undefined)),
          onUpdated: vi.fn(() => vi.fn()),
        },
      },
    });
    const desktopStore = startDesktopStore();

    expect(desktopStore.getState().store).toBeNull();
    expect(desktopStore.getState().loadError).toBeNull();
  });

  it('keeps the store synchronized with loaded, updated, and applied stores', async () => {
    const initialStore = makeStore({ user: { nickname: '初始用户' } });
    const updatedStore = makeStore({ user: { nickname: '外部更新' } });
    const appliedStore = makeStore({ user: { nickname: '本地应用' } });
    const offStoreUpdated = vi.fn();
    const offArticlePatched = vi.fn();
    const offCollectionPatched = vi.fn();
    const offLibraryPinPatched = vi.fn();
    let emitStoreUpdated = noopStoreUpdated;
    let emitArticlePatched = noopArticlePatched;
    let emitCollectionPatched = noopCollectionPatched;
    let emitLibraryPinPatched = noopLibraryPinPatched;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          getStateResult: vi.fn().mockResolvedValue({ ok: true, store: initialStore }),
          onUpdated: vi.fn((callback: (store: DesktopStore) => void) => {
            emitStoreUpdated = callback;
            return offStoreUpdated;
          }),
        },
        article: {
          onPatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
            emitArticlePatched = callback;
            return offArticlePatched;
          }),
        },
        library: {
          collections: {
            onPatched: vi.fn((callback: (patch: CollectionStorePatch) => void) => {
              emitCollectionPatched = callback;
              return offCollectionPatched;
            }),
          },
          pins: {
            onPatched: vi.fn((callback: (patch: LibraryPinPatch) => void) => {
              emitLibraryPinPatched = callback;
              return offLibraryPinPatched;
            }),
          },
        },
      },
    });

    const desktopStore = startDesktopStore();

    await vi.waitFor(() => expect(desktopStore.getState().store).not.toBeNull());
    expect(desktopStore.getState().store).toBe(initialStore);
    expect(desktopStore.getState().settingsSyncSnapshot).toEqual({
      user: initialStore.user,
      settings: initialStore.settings,
    });
    expect(desktopStore.getState().settingsSyncSnapshot).not.toHaveProperty('articles');

    emitStoreUpdated(updatedStore);

    expect(desktopStore.getState().store).toBe(updatedStore);
    const settingsSyncSnapshot = desktopStore.getState().settingsSyncSnapshot;
    expect(settingsSyncSnapshot).toEqual({
      user: updatedStore.user,
      settings: updatedStore.settings,
    });

    const patchedArticle = articleSummary({
      id: 'article_1',
      counts: {
        annotationCount: 1,
        thoughtCount: 1,
        discussionCommentCount: 0,
        aiCommentCount: 0,
        distillationCount: 0,
      },
    });
    emitArticlePatched({ type: 'article-upsert', article: patchedArticle });

    expect(desktopStore.getState().store?.articles).toEqual([patchedArticle]);
    expect(desktopStore.getState().settingsSyncSnapshot).toBe(settingsSyncSnapshot);

    const patchedUser = { ...updatedStore.user, nickname: '局部更新' };
    desktopStore.getState().applySettingsPatch({ user: patchedUser });

    expect(desktopStore.getState().store?.user).toEqual(patchedUser);
    expect(desktopStore.getState().store?.articles).toEqual([patchedArticle]);

    emitCollectionPatched({
      type: 'collection-upsert',
      collection: {
        id: 'collection_1',
        name: '合集',
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    });

    expect(desktopStore.getState().store?.collections.map((collection) => collection.id)).toEqual([
      'collection_1',
    ]);

    emitLibraryPinPatched({
      type: 'library-pin',
      pinned: true,
      pin: {
        targetKind: 'collection',
        targetId: 'collection_1',
        pinnedAt: '2026-06-21T00:01:00.000Z',
      },
    });

    expect(desktopStore.getState().store?.pins).toEqual([
      {
        targetKind: 'collection',
        targetId: 'collection_1',
        pinnedAt: '2026-06-21T00:01:00.000Z',
      },
    ]);

    desktopStore.getState().applyStore(appliedStore);

    expect(desktopStore.getState().store).toBe(appliedStore);

    const currentArticleSink = {
      isCurrent: vi.fn((articleId: string) => articleId === patchedArticle.id),
      apply: vi.fn(),
    };
    const unregisterCurrentArticleSink = desktopStore
      .getState()
      .articleStore.registerCurrentArticleSink(currentArticleSink);

    emitArticlePatched({ type: 'article-delete', articleId: patchedArticle.id });

    expect(currentArticleSink.apply).toHaveBeenCalledWith({
      type: 'delete',
      articleId: patchedArticle.id,
    });
    unregisterCurrentArticleSink();
  });

  it('exposes store load errors without leaving an unhandled startup failure', async () => {
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          getStateResult: vi.fn().mockResolvedValue({
            ok: false,
            error: {
              code: 'DATABASE_TOO_NEW',
              message: '请安装最新版继续使用。',
              requiredReaderLevel: 2,
              supportedReaderLevel: 1,
              logPath: '/tmp/yomitomo-agent.log',
            },
          }),
          onUpdated: vi.fn(() => vi.fn()),
        },
      },
    });

    const desktopStore = startDesktopStore();

    await vi.waitFor(() =>
      expect(desktopStore.getState().loadError?.code).toBe('DATABASE_TOO_NEW'),
    );
    expect(desktopStore.getState().loadError).not.toBeNull();
    expect(desktopStore.getState().loadError).toMatchObject({
      message: '请安装最新版继续使用。',
      requiredReaderLevel: 2,
      supportedReaderLevel: 1,
      logPath: '/tmp/yomitomo-agent.log',
    });
  });

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

  it('keeps load errors when an article patch is ignored while locked', async () => {
    const lockedStore = makeStore({
      settings: { appLockEnabled: true, appLockLocked: true },
    });
    const getStateResult = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, store: lockedStore })
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: 'DATABASE_TOO_NEW',
          message: '请安装最新版继续使用。',
          requiredReaderLevel: 2,
          supportedReaderLevel: 1,
        },
      });
    let emitArticlePatched = noopArticlePatched;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        store: {
          getStateResult,
          onUpdated: vi.fn(() => vi.fn()),
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
    await desktopStore.getState().refreshStore();
    expect(desktopStore.getState().loadError).not.toBeNull();
    expect(desktopStore.getState().loadError?.code).toBe('DATABASE_TOO_NEW');

    emitArticlePatched({
      type: 'article-upsert',
      article: articleSummary({ id: 'article_secret' }),
    });

    expect(desktopStore.getState().loadError).not.toBeNull();
    expect(desktopStore.getState().loadError?.code).toBe('DATABASE_TOO_NEW');
  });
});

function noopStoreUpdated(_store: DesktopStore) {}
function noopArticlePatched(_patch: ArticleStorePatch) {}
function noopCollectionPatched(_patch: CollectionStorePatch) {}
function noopLibraryPinPatched(_patch: LibraryPinPatch) {}

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
