// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, ArticleSummaryRecord, WeReadBookDetail } from '@yomitomo/shared';
import { useReadingLibraryNavigation } from './use-reading-library-navigation';

describe('useReadingLibraryNavigation', () => {
  it('models library, article, and WeRead routes as exclusive states', async () => {
    const { result } = renderHook(() =>
      useReadingLibraryNavigation({ onReadArticle: async () => null }),
    );

    expect(result.current.model).toMatchObject({
      activeShelf: 'library',
      article: null,
      routeTransition: 'none',
      routeType: 'library',
      wereadBook: null,
    });

    await act(async () => {
      await result.current.actions.openArticle(article());
    });
    act(() => result.current.actions.selectAnnotation('annotation_1'));
    expect(result.current.model).toMatchObject({
      activeShelf: 'source',
      article: { id: 'article_1' },
      routeTransition: 'enter-source',
      routeType: 'article',
      selectedAnnotationId: 'annotation_1',
      wereadBook: null,
    });

    act(() => result.current.actions.returnToLibrary());
    expect(result.current.model).toMatchObject({
      activeShelf: 'library',
      article: { id: 'article_1' },
      routeTransition: 'enter-library',
      selectedAnnotationId: null,
    });

    act(() => result.current.actions.showWeReadBook(wereadBookDetail));
    expect(result.current.model).toMatchObject({
      activeShelf: 'source',
      article: null,
      routeType: 'weread',
      wereadBook: { book: { bookId: 'weread_1' } },
    });

    act(() => result.current.actions.resetLibrary());
    expect(result.current.model).toMatchObject({
      activeShelf: 'library',
      article: null,
      routeType: 'library',
      wereadBook: null,
    });
  });

  it('ignores article loads superseded by a newer request', async () => {
    const first = createDeferred<ArticleRecord | null>();
    const second = createDeferred<ArticleRecord | null>();
    const onReadArticle = vi.fn((articleId: string) =>
      articleId === 'article_1' ? first.promise : second.promise,
    );
    const { result } = renderHook(() => useReadingLibraryNavigation({ onReadArticle }));

    let firstRequest!: Promise<ArticleRecord | null>;
    let secondRequest!: Promise<ArticleRecord | null>;
    act(() => {
      firstRequest = result.current.actions.openArticle(articleSummary('article_1'));
      secondRequest = result.current.actions.openArticle(articleSummary('article_2'));
    });
    await act(async () => second.resolve(article({ id: 'article_2' })));
    await expect(secondRequest).resolves.toMatchObject({ id: 'article_2' });
    await act(async () => first.resolve(article({ id: 'article_1' })));
    await expect(firstRequest).resolves.toBeNull();

    expect(result.current.model.article?.id).toBe('article_2');
  });

  it('opens an article focused on a requested annotation', async () => {
    const { result } = renderHook(() =>
      useReadingLibraryNavigation({ onReadArticle: async () => null }),
    );

    await act(async () => {
      await result.current.actions.openArticle(article(), 'annotation_1');
    });

    expect(result.current.model).toMatchObject({
      article: { id: 'article_1' },
      focusAnnotationId: 'annotation_1',
      selectedAnnotationId: 'annotation_1',
    });
  });

  it('cancels pending loads and closes the active article on unmount', async () => {
    const pending = createDeferred<ArticleRecord | null>();
    const onCloseArticleDiscussions = vi.fn();
    const { result, unmount } = renderHook(() =>
      useReadingLibraryNavigation({
        onCloseArticleDiscussions,
        onReadArticle: () => pending.promise,
      }),
    );

    await act(async () => {
      await result.current.actions.openArticle(article());
    });
    let pendingRequest!: Promise<ArticleRecord | null>;
    act(() => {
      pendingRequest = result.current.actions.openArticle(articleSummary('article_2'));
    });
    unmount();
    pending.resolve(article({ id: 'article_2' }));

    await expect(pendingRequest).resolves.toBeNull();
    expect(onCloseArticleDiscussions).toHaveBeenCalledOnce();
    expect(onCloseArticleDiscussions).toHaveBeenCalledWith('article_1');
  });
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/article',
    canonicalUrl: 'https://example.com/article',
    title: 'Article',
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    ...overrides,
  };
}

function articleSummary(id: string): ArticleSummaryRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    byline: '',
    siteName: 'Example',
    contentHash: `hash_${id}`,
    annotations: [],
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
  };
}

const wereadBookDetail = {
  book: {
    bookId: 'weread_1',
    title: 'WeRead',
    author: 'Author',
    reviewCount: 0,
    noteCount: 0,
    bookmarkCount: 0,
    readingProgress: 0,
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
  chapters: [],
  highlights: [],
  thoughts: [],
} as WeReadBookDetail;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
