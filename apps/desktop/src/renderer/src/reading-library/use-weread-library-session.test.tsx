// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, WeReadBook, WeReadBookDetail } from '@yomitomo/shared';
import { useWeReadLibrarySession } from './use-weread-library-session';
import { useReadingLibraryNavigation } from './use-reading-library-navigation';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useWeReadLibrarySession', () => {
  it('keeps the latest book when cached reads finish out of order', async () => {
    const first = createDeferred<WeReadBookDetail | null>();
    const second = createDeferred<WeReadBookDetail | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getBook: (bookId: string) => (bookId === 'weread_1' ? first.promise : second.promise),
      },
    });
    const { result } = renderHook(() => useLibrarySession());
    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;
    act(() => {
      firstRequest = result.current.session.openBook(weReadDetail('weread_1').book);
      secondRequest = result.current.session.openBook(weReadDetail('weread_2').book);
    });
    await act(async () => {
      second.resolve(weReadDetail('weread_2'));
      await secondRequest;
    });
    await act(async () => {
      first.resolve(weReadDetail('weread_1'));
      await firstRequest;
    });

    expect(result.current.navigation.model.wereadBook?.book.bookId).toBe('weread_2');
  });

  it('opens a cached book once without starting a redundant sync', async () => {
    const detail = weReadDetail();
    const syncBook = vi.fn();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getState: vi.fn().mockResolvedValue({
          settings: { configured: true, openMethod: 'deeplink' },
          books: [detail.book],
        }),
        getBook: vi.fn().mockResolvedValue(detail),
        syncBook,
      },
    });
    const { result } = renderHook(() => useLibrarySession());

    await act(() => result.current.session.openBook(detail.book));

    expect(result.current.navigation.model.wereadBook).toEqual(detail);
    expect(syncBook).not.toHaveBeenCalled();
  });

  it('opens a synchronized book when the cached detail is empty', async () => {
    const detail = weReadDetail();
    const syncBook = vi.fn().mockResolvedValue(detail);
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getBook: vi.fn().mockResolvedValue({ ...detail, chapters: [] }),
        syncBook,
      },
    });
    const { result } = renderHook(() => useLibrarySession());

    await act(() => result.current.session.openBook(detail.book));

    expect(result.current.navigation.model.wereadBook).toEqual(detail);
    expect(syncBook).toHaveBeenCalledExactlyOnceWith(detail.book.bookId);
    expect(result.current.session.bookSyncing).toBe(false);
  });

  it.each([weReadDetail(), null])(
    'keeps a local article when a previous book sync returns %j',
    async (detail) => {
      const pending = createDeferred<WeReadBookDetail | null>();
      vi.stubGlobal('yomitomoDesktop', {
        weRead: { syncBook: () => pending.promise },
      });
      const { result } = renderHook(() => useLibrarySession());
      let request!: Promise<WeReadBookDetail | null>;
      act(() => {
        request = result.current.session.syncBook('weread_1');
      });
      await act(() => result.current.navigation.actions.openArticle(article()));
      await act(async () => {
        pending.resolve(detail);
        await request;
      });

      await expect(request).resolves.toBeNull();
      expect(result.current.navigation.model).toMatchObject({
        activeShelf: 'source',
        article: { id: 'article_1' },
        wereadBook: null,
      });
    },
  );

  it('does not reopen a book after returning to the library during sync', async () => {
    const detail = weReadDetail();
    const pending = createDeferred<WeReadBookDetail | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getBook: vi.fn().mockResolvedValue(detail),
        syncBook: () => pending.promise,
      },
    });
    const { result } = renderHook(() => useLibrarySession());
    await act(() => result.current.session.openBook(detail.book));
    let request!: Promise<WeReadBookDetail | null>;
    act(() => {
      request = result.current.session.syncBook(detail.book.bookId);
      result.current.navigation.actions.returnToLibrary();
    });
    await act(async () => {
      pending.resolve(detail);
      await request;
    });

    await expect(request).resolves.toBeNull();
    expect(result.current.navigation.model.activeShelf).toBe('library');
  });

  it('keeps a newer article request while an older cached book finishes loading', async () => {
    const bookRead = createDeferred<WeReadBookDetail | null>();
    const articleRead = createDeferred<ArticleRecord | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: { getBook: () => bookRead.promise },
    });
    const { result } = renderHook(() => useLibrarySession(() => articleRead.promise));
    let bookRequest!: Promise<void>;
    let articleRequest!: Promise<ArticleRecord | null>;
    act(() => {
      bookRequest = result.current.session.openBook(weReadDetail().book);
      articleRequest = result.current.navigation.actions.openArticle('article_1');
    });
    await act(async () => {
      bookRead.resolve(weReadDetail());
      await bookRequest;
    });
    expect(result.current.navigation.model.activeShelf).toBe('library');
    await act(async () => {
      articleRead.resolve(article());
      await articleRequest;
    });

    expect(result.current.navigation.model.article?.id).toBe('article_1');
  });

  it('supersedes a pending article request when opening a book', async () => {
    const pending = createDeferred<ArticleRecord | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: { getBook: vi.fn().mockResolvedValue(weReadDetail()) },
    });
    const { result } = renderHook(() => useLibrarySession(() => pending.promise));
    let request!: Promise<ArticleRecord | null>;
    act(() => {
      request = result.current.navigation.actions.openArticle('article_1');
    });
    await act(() => result.current.session.openBook(weReadDetail().book));
    await act(async () => {
      pending.resolve(article());
      await request;
    });

    await expect(request).resolves.toBeNull();
    expect(result.current.navigation.model.wereadBook?.book.bookId).toBe('weread_1');
  });

  it('keeps syncing until overlapping requests finish and only displays the newest result', async () => {
    const first = createDeferred<WeReadBookDetail | null>();
    const second = createDeferred<WeReadBookDetail | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        syncBook: vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
      },
    });
    const { result } = renderHook(() => useLibrarySession());
    let firstRequest!: Promise<WeReadBookDetail | null>;
    let secondRequest!: Promise<WeReadBookDetail | null>;
    act(() => {
      firstRequest = result.current.session.syncBook('weread_1');
      secondRequest = result.current.session.syncBook('weread_1');
    });
    await act(async () => {
      first.resolve(weReadDetail());
      await firstRequest;
    });
    expect(result.current.session.bookSyncing).toBe(true);
    expect(result.current.navigation.model.wereadBook).toBeNull();
    await act(async () => {
      second.resolve(weReadDetail());
      await secondRequest;
    });
    expect(result.current.session.bookSyncing).toBe(false);
    expect(result.current.navigation.model.wereadBook).toEqual(weReadDetail());
  });

  it('clears a missing current book and can open another after a sync error', async () => {
    vi.stubGlobal('yomitomoDesktop', {
      weRead: {
        getBook: vi.fn().mockResolvedValue(weReadDetail()),
        syncBook: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockRejectedValueOnce(new Error('sync failed'))
          .mockResolvedValueOnce(weReadDetail('weread_2')),
      },
    });
    const { result } = renderHook(() => useLibrarySession());
    await act(() => result.current.session.openBook(weReadDetail().book));
    await act(() => result.current.session.syncBook('weread_1'));
    expect(result.current.navigation.model.routeType).toBe('library');
    await expect(act(() => result.current.session.syncBook('weread_1'))).rejects.toThrow(
      'sync failed',
    );
    expect(result.current.session.bookSyncing).toBe(false);
    await act(() => result.current.session.syncBook('weread_2'));
    expect(result.current.navigation.model.wereadBook?.book.bookId).toBe('weread_2');
  });

  it('discards a sync completion after unmount', async () => {
    const pending = createDeferred<WeReadBookDetail | null>();
    vi.stubGlobal('yomitomoDesktop', {
      weRead: { syncBook: () => pending.promise },
    });
    const { result, unmount } = renderHook(() => useLibrarySession());
    let request!: Promise<WeReadBookDetail | null>;
    act(() => {
      request = result.current.session.syncBook('weread_1');
    });
    unmount();
    pending.resolve(weReadDetail());

    await expect(request).resolves.toBeNull();
  });
});

function useLibrarySession(
  onReadArticle: (id: string) => Promise<ArticleRecord | null> = async () => null,
) {
  const navigation = useReadingLibraryNavigation({ onReadArticle });
  const session = useWeReadLibrarySession({ onOpenBook: navigation.actions.openWeReadBook });
  return { navigation, session };
}

function article(): ArticleRecord {
  return {
    id: 'article_1',
    sourceType: 'web',
    title: 'Article',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

function weReadDetail(bookId = 'weread_1'): WeReadBookDetail {
  const book: WeReadBook = {
    bookId,
    title: '微信读书标题',
    reviewCount: 1,
    noteCount: 1,
    bookmarkCount: 1,
    readingProgress: 20,
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
  return {
    book,
    chapters: [{ bookId: book.bookId, chapterUid: 1, chapterIdx: 0, title: '第一章', level: 1 }],
    highlights: [],
    thoughts: [],
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
