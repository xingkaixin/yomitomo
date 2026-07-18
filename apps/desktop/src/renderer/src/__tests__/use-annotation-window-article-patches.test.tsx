// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, ArticleStorePatch } from '@yomitomo/shared';
import { useAnnotationWindowArticlePatches } from '../annotation-discussion/use-annotation-window-article-patches';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

describe('annotation window article patch sync', () => {
  it('reloads matching articles and ignores unrelated patches', async () => {
    const updatedAnnotation = annotation({ updatedAt: '2026-07-18T00:02:00.000Z' });
    const updatedArticle = article(updatedAnnotation);
    const getArticle = vi.fn().mockResolvedValue(updatedArticle);
    const unsubscribe = vi.fn();
    let emitPatch = noopArticlePatch;
    installDesktopApi({
      getArticle,
      onArticlePatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
        emitPatch = callback;
        return unsubscribe;
      }),
    });
    const onUpdate = vi.fn();
    const { unmount } = renderHook(() =>
      useAnnotationWindowArticlePatches('article_1', 'annotation_1', onUpdate),
    );

    act(() => emitPatch({ type: 'article-delete', articleId: 'other_article' }));

    expect(getArticle).not.toHaveBeenCalled();

    act(() =>
      emitPatch({
        type: 'article-upsert',
        article: updatedArticle,
      }),
    );

    await waitFor(() =>
      expect(onUpdate).toHaveBeenCalledWith({
        annotation: updatedAnnotation,
        article: updatedArticle,
      }),
    );
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('marks the annotation window missing after its article disappears', async () => {
    let emitPatch = noopArticlePatch;
    installDesktopApi({
      getArticle: vi.fn().mockResolvedValue(null),
      onArticlePatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
        emitPatch = callback;
        return vi.fn();
      }),
    });
    const onUpdate = vi.fn();
    renderHook(() => useAnnotationWindowArticlePatches('article_1', 'annotation_1', onUpdate));

    act(() => emitPatch({ type: 'article-delete', articleId: 'article_1' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(null));
  });
});

function installDesktopApi(desktop: {
  getArticle: ReturnType<typeof vi.fn>;
  onArticlePatched: ReturnType<typeof vi.fn>;
}) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktop,
  });
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'Quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: 'user',
    color: '#000000',
    comments: [],
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function noopArticlePatch(_patch: ArticleStorePatch) {}

function article(sourceAnnotation: Annotation): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com',
    canonicalUrl: 'https://example.com',
    sourceType: 'web',
    title: 'Article',
    contentHash: 'hash',
    annotations: [sourceAnnotation],
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: sourceAnnotation.updatedAt,
  };
}
