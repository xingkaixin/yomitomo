// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';

import { initializeAppI18n } from '../i18n/app-i18n';
import { emptyStore } from '../settings/app-settings';
import { useDesktopStoreState } from '../shell/app-desktop-store-state';

beforeEach(() => {
  initializeAppI18n('zh-CN');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useDesktopStoreState', () => {
  it('keeps storeRef synchronized with loaded, updated, and applied stores', async () => {
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
        getStateResult: vi.fn().mockResolvedValue({ ok: true, store: initialStore }),
        onStoreUpdated: vi.fn((callback: (store: DesktopStore) => void) => {
          emitStoreUpdated = callback;
          return offStoreUpdated;
        }),
        onArticlePatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
          emitArticlePatched = callback;
          return offArticlePatched;
        }),
        onCollectionPatched: vi.fn((callback: (patch: CollectionStorePatch) => void) => {
          emitCollectionPatched = callback;
          return offCollectionPatched;
        }),
        onLibraryPinPatched: vi.fn((callback: (patch: LibraryPinPatch) => void) => {
          emitLibraryPinPatched = callback;
          return offLibraryPinPatched;
        }),
      },
    });

    const latest: { current?: ReturnType<typeof useDesktopStoreState> } = {};

    function Harness() {
      latest.current = useDesktopStoreState();
      return null;
    }

    render(<Harness />);

    await waitFor(() => expect(latest.current?.storeLoaded).toBe(true));
    expect(latest.current?.store).toBe(initialStore);
    expect(latest.current?.storeRef.current).toBe(initialStore);

    act(() => {
      emitStoreUpdated(updatedStore);
    });

    expect(latest.current?.store).toBe(updatedStore);
    expect(latest.current?.storeRef.current).toBe(updatedStore);

    const patchedArticle = articleSummary({ id: 'article_1', commentCount: 1 });
    act(() => {
      emitArticlePatched({ type: 'article-upsert', article: patchedArticle });
    });

    expect(latest.current?.store.articles).toEqual([patchedArticle]);
    expect(latest.current?.storeRef.current.articles).toEqual([patchedArticle]);

    act(() => {
      emitCollectionPatched({
        type: 'collection-upsert',
        collection: {
          id: 'collection_1',
          name: '集合',
          createdAt: '2026-06-21T00:00:00.000Z',
          updatedAt: '2026-06-21T00:00:00.000Z',
        },
      });
    });

    expect(latest.current?.store.collections.map((collection) => collection.id)).toEqual([
      'collection_1',
    ]);
    expect(latest.current?.storeRef.current.collections.map((collection) => collection.id)).toEqual(
      ['collection_1'],
    );

    act(() => {
      emitLibraryPinPatched({
        type: 'library-pin',
        pinned: true,
        pin: {
          targetKind: 'collection',
          targetId: 'collection_1',
          pinnedAt: '2026-06-21T00:01:00.000Z',
        },
      });
    });

    expect(latest.current?.store.pins).toEqual([
      {
        targetKind: 'collection',
        targetId: 'collection_1',
        pinnedAt: '2026-06-21T00:01:00.000Z',
      },
    ]);

    act(() => {
      latest.current?.applyStore(appliedStore);
    });

    expect(latest.current?.store).toBe(appliedStore);
    expect(latest.current?.storeRef.current).toBe(appliedStore);
  });

  it('exposes store load errors without leaving an unhandled startup failure', async () => {
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
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
        onStoreUpdated: vi.fn(() => vi.fn()),
      },
    });

    const latest: { current?: ReturnType<typeof useDesktopStoreState> } = {};

    function Harness() {
      latest.current = useDesktopStoreState();
      return null;
    }

    render(<Harness />);

    await waitFor(() => expect(latest.current?.storeLoadError?.code).toBe('DATABASE_TOO_NEW'));
    expect(latest.current?.storeLoaded).toBe(false);
    expect(latest.current?.storeLoadError).toMatchObject({
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
        getAppLockStatus: vi.fn().mockResolvedValue({
          configured: true,
          enabled: true,
          locked: true,
          shortcut: 'CommandOrControl+L',
        }),
        getStateResult: vi.fn().mockRejectedValue({
          code: 'APP_LOCK_REQUIRED',
          message: 'APP_LOCK_REQUIRED',
        }),
        onArticlePatched: vi.fn(() => vi.fn()),
        onStoreUpdated: vi.fn(() => vi.fn()),
      },
    });

    const latest: { current?: ReturnType<typeof useDesktopStoreState> } = {};

    function Harness() {
      latest.current = useDesktopStoreState();
      return null;
    }

    render(<Harness />);

    await waitFor(() => expect(latest.current?.storeLoaded).toBe(true));
    expect(latest.current?.storeLoadError).toBeNull();
    expect(latest.current?.store.settings).toMatchObject({
      appLockEnabled: true,
      appLockLocked: true,
      appLockShortcut: 'CommandOrControl+L',
    });
    expect(latest.current?.store.articles).toEqual([]);
  });
});

function noopStoreUpdated(_store: DesktopStore) {}
function noopArticlePatched(_patch: ArticleStorePatch) {}
function noopCollectionPatched(_patch: CollectionStorePatch) {}
function noopLibraryPinPatched(_patch: LibraryPinPatch) {}

function makeStore(
  input: {
    user?: Partial<DesktopStore['user']>;
    settings?: DesktopStore['settings'];
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
    settings: input.settings || {},
    providers: input.providers || [],
    agents: input.agents || [],
    articles: input.articles || [],
    collections: input.collections || [],
    collectionMembers: input.collectionMembers || [],
    pins: input.pins || [],
  };
}

function articleSummary(
  input: Partial<DesktopStore['articles'][number]>,
): DesktopStore['articles'][number] {
  return {
    id: input.id || 'article_1',
    title: input.title || '文章',
    url: input.url || '',
    canonicalUrl: input.canonicalUrl || input.url || '',
    excerpt: input.excerpt || '',
    byline: input.byline || '',
    siteName: input.siteName || '',
    contentHash: input.contentHash || 'hash',
    sourceType: input.sourceType || 'web',
    readingProgress: input.readingProgress,
    annotations: input.annotations || [],
    annotationCount: input.annotationCount || 0,
    commentCount: input.commentCount || 0,
    aiCommentCount: input.aiCommentCount || 0,
    distillationCount: input.distillationCount || 0,
    createdAt: input.createdAt || '2026-06-15T00:00:00.000Z',
    updatedAt: input.updatedAt || '2026-06-15T00:00:00.000Z',
  };
}
