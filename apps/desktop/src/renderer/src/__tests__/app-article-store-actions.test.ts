import { describe, expect, it } from 'vitest';
import type { ArticleRecord, DesktopStore } from '@yomitomo/shared';

import { emptyStore } from '../app-settings';
import { applyArticleReadingProgressPatch } from '../app-article-store-actions';

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
