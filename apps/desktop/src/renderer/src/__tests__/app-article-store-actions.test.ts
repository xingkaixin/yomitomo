// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, ArticleSummaryRecord, DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import {
  applyArticleStorePatch,
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
    const savedSummary = articleSummary(savedArticle);
    const storeRef: { current: DesktopStore } = {
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
      article: savedSummary,
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
      articles: [savedSummary, secondArticle],
    });
  });

  it('applies the imported article patch without a full store result', async () => {
    const firstArticle = makeArticle('article-1');
    const importedArticle = makeArticle('article-imported');
    const importedSummary = articleSummary(importedArticle);
    const storeRef: { current: DesktopStore } = {
      current: {
        ...emptyStore,
        articles: [firstArticle],
      },
    };
    const applyStore = vi.fn((store: DesktopStore) => {
      storeRef.current = store;
      return store;
    });
    const importArticleUrl = vi.fn().mockResolvedValue({
      status: 'imported',
      article: importedArticle,
      patch: {
        type: 'article-upsert',
        article: importedSummary,
      },
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { importArticleUrl },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    let result!: Awaited<ReturnType<typeof actions.importArticleUrl>>;
    await act(async () => {
      result = await actions.importArticleUrl('https://example.com/imported');
    });

    expect(result).toMatchObject({ status: 'imported', article: importedArticle });
    expect(importArticleUrl).toHaveBeenCalledWith('https://example.com/imported');
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [importedSummary, firstArticle],
    });
  });

  it('does not replace the store when imported article is a duplicate', async () => {
    const firstArticle = makeArticle('article-1');
    const storeRef: { current: DesktopStore } = {
      current: {
        ...emptyStore,
        articles: [firstArticle],
      },
    };
    const applyStore = vi.fn((store: DesktopStore) => {
      storeRef.current = store;
      return store;
    });
    const importArticleUrl = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: firstArticle,
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { importArticleUrl },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.importArticleUrl('https://example.com/article-1');
    });

    expect(applyStore).not.toHaveBeenCalled();
    expect(storeRef.current.articles).toEqual([firstArticle]);
  });

  it('applies the imported ebook patch without a full store result', async () => {
    const firstArticle = makeArticle('article-1');
    const importedArticle = makeArticle('ebook-imported');
    const importedSummary = articleSummary(importedArticle);
    const storeRef: { current: DesktopStore } = {
      current: {
        ...emptyStore,
        articles: [firstArticle],
      },
    };
    const applyStore = vi.fn((store: DesktopStore) => {
      storeRef.current = store;
      return store;
    });
    const importEbookFile = vi.fn().mockResolvedValue({
      status: 'imported',
      article: importedArticle,
      patch: {
        type: 'article-upsert',
        article: importedSummary,
      },
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { importEbookFile },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.importEbookFile(new File(['ebook'], 'book.epub'));
    });

    expect(importEbookFile).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'book.epub' }),
    );
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [importedSummary, firstArticle],
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

describe('applyArticleStorePatch', () => {
  it('applies article upsert patches', () => {
    const firstArticle = makeArticle('article-1');
    const savedArticle = makeArticle('article-saved');
    const savedSummary = articleSummary(savedArticle);
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle],
    };

    expect(
      applyArticleStorePatch(store, { type: 'article-upsert', article: savedSummary }).articles,
    ).toEqual([savedSummary, firstArticle]);
  });

  it('applies article reading progress patches', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };
    const readingProgress = {
      pageIndex: 2,
      pageCount: 12,
      progress: 0.25,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(
      applyArticleStorePatch(store, {
        type: 'article-reading-progress',
        articleId: firstArticle.id,
        readingProgress,
        updatedAt: readingProgress.updatedAt,
      }).articles,
    ).toEqual([
      { ...firstArticle, readingProgress, updatedAt: readingProgress.updatedAt },
      secondArticle,
    ]);
  });

  it('applies article delete patches', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };

    expect(
      applyArticleStorePatch(store, { type: 'article-delete', articleId: firstArticle.id })
        .articles,
    ).toEqual([secondArticle]);
  });
});

describe('applyArticleUpsertPatch', () => {
  it('replaces only the target article', () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const savedArticle = { ...firstArticle, title: 'Saved article' };
    const savedSummary = articleSummary(savedArticle);
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle, secondArticle],
    };

    const nextStore = applyArticleUpsertPatch(store, {
      type: 'article-upsert',
      article: savedSummary,
    });

    expect(nextStore.articles).toEqual([savedSummary, secondArticle]);
    expect(nextStore.articles[1]).toBe(secondArticle);
  });

  it('prepends a newly saved article', () => {
    const firstArticle = makeArticle('article-1');
    const savedArticle = makeArticle('article-new');
    const savedSummary = articleSummary(savedArticle);
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle],
    };

    expect(
      applyArticleUpsertPatch(store, { type: 'article-upsert', article: savedSummary }).articles,
    ).toEqual([savedSummary, firstArticle]);
  });

  it('keeps full-only fields out of the article list', () => {
    const firstArticle = makeArticle('article-1');
    const savedArticle = {
      ...firstArticle,
      contentHtml: '<p>Updated body</p>',
      focusCoReadingPlan: {
        id: 'plan-1',
        articleId: firstArticle.id,
        selectedAgentIds: [],
        sections: [],
        createdAt: firstArticle.createdAt,
        updatedAt: firstArticle.updatedAt,
      },
    };
    const store: DesktopStore = {
      ...emptyStore,
      articles: [firstArticle],
    };

    const nextStore = applyArticleUpsertPatch(store, {
      type: 'article-upsert',
      article: articleSummary(savedArticle),
    });

    expect(nextStore.articles[0]).not.toHaveProperty('contentHtml');
    expect(nextStore.articles[0]).not.toHaveProperty('focusCoReadingPlan');
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

function articleSummary(article: ArticleRecord): ArticleSummaryRecord {
  const summary = { ...article };
  delete summary.contentHtml;
  delete summary.focusCoReadingPlan;
  if (summary.ebook) {
    return {
      ...summary,
      ebook: { metadata: summary.ebook.metadata },
    };
  }
  return summary;
}
