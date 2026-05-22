// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import {
  applyArticleUpsertPatch,
  applyArticleDeletePatch,
  applyArticleReadingProgressPatch,
  useAppArticleStoreActions,
} from '../app-article-store-actions';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

describe('useAppArticleStoreActions', () => {
  it('applies the article save upsert patch without a full store result', async () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const savedArticle = { ...firstArticle, title: 'Saved article' };
    const storeRef = {
      current: {
        ...emptyStore,
        articles: [firstArticle, secondArticle],
      },
    };
    const applyStore = vi.fn((store: DesktopStore) => {
      storeRef.current = store;
      return store;
    });
    const saveArticle = vi.fn().mockResolvedValue({
      type: 'article-upsert',
      article: savedArticle,
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { saveArticle },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.saveArticle(savedArticle);
    });

    expect(saveArticle).toHaveBeenCalledWith(savedArticle);
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [savedArticle, secondArticle],
    });
  });
});

describe('applyArticleReadingProgressPatch', () => {
  it('updates only the target article progress', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };
    const readingProgress = {
      pageIndex: 4,
      pageCount: 20,
      chapterIndex: 1,
      chapterProgress: 0.3,
      progress: 0.42,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    const nextStore = applyArticleReadingProgressPatch(store, {
      articleId: firstArticle.id,
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });

    expect(nextStore.articles[0]).toEqual({
      ...firstArticle,
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
    expect(nextStore.articles[1]).toBe(secondArticle);
  });
});

describe('applyArticleUpsertPatch', () => {
  it('replaces only the target article', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const savedArticle = { ...firstArticle, title: 'Saved article' };
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };

    const nextStore = applyArticleUpsertPatch(store, {
      type: 'article-upsert',
      article: savedArticle,
    });

    expect(nextStore.articles).toEqual([savedArticle, secondArticle]);
    expect(nextStore.articles[1]).toBe(secondArticle);
  });

  it('prepends a newly saved article', () => {
    const firstArticle = makeArticle('article-1');
    const savedArticle = makeArticle('article-new');
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle],
    };

    expect(
      applyArticleUpsertPatch(store, { type: 'article-upsert', article: savedArticle }).articles,
    ).toEqual([savedArticle, firstArticle]);
  });
});

describe('applyArticleDeletePatch', () => {
  it('removes only the deleted article from the store', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };

    expect(applyArticleDeletePatch(store, { articleId: firstArticle.id }).articles).toEqual([
      secondArticle,
    ]);
  });
});

function makeArticle(id: string): ArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>Hello</p>',
    contentHash: `hash_${id}`,
    annotations: [],
    createdAt: '2026-05-17T07:00:00.000Z',
    updatedAt: '2026-05-17T07:00:00.000Z',
  };
}
