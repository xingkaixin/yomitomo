import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleCounts } from '@yomitomo/core';
import type {
  Annotation,
  ArticleRecord,
  ArticleStorePatch,
  ArticleSummaryRecord,
} from '@yomitomo/shared';
import { bindAnnotationWindowArticle } from '../annotation-discussion/annotation-window-startup';

const route = {
  annotationId: 'annotation_1',
  articleId: 'article_1',
  params: new URLSearchParams(),
};

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'yomitomoDesktop');
});

describe('annotation window article binding', () => {
  it('reloads matching articles, ignores unrelated patches and unsubscribes on dispose', async () => {
    const initialAnnotation = annotation();
    const updatedAnnotation = annotation({ updatedAt: '2026-07-18T00:02:00.000Z' });
    const updatedArticle = article(updatedAnnotation);
    const getArticle = vi
      .fn()
      .mockResolvedValueOnce(article(initialAnnotation))
      .mockResolvedValue(updatedArticle);
    const unsubscribe = vi.fn();
    let emitPatch = noopArticlePatch;
    installDesktopApi({
      getArticle,
      onArticlePatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
        emitPatch = callback;
        return unsubscribe;
      }),
    });
    const events = windowEvents();
    const unbind = bindAnnotationWindowArticle(route, events);
    await vi.waitFor(() => expect(events.loaded).toHaveBeenCalledOnce());

    emitPatch({ type: 'article-delete', articleId: 'other_article' });
    emitPatch({
      type: 'article-reading-progress',
      articleId: 'article_1',
      readingProgress: { kind: 'scroll', progress: 0.4, updatedAt: '2026-07-18T00:03:00.000Z' },
      updatedAt: '2026-07-18T00:03:00.000Z',
    });

    expect(getArticle).toHaveBeenCalledOnce();

    emitPatch({ type: 'article-upsert', article: articleSummary(updatedArticle) });

    await vi.waitFor(() =>
      expect(events.patched).toHaveBeenCalledWith(updatedArticle, updatedAnnotation),
    );
    unbind();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('marks the annotation window missing after its article disappears', async () => {
    let emitPatch = noopArticlePatch;
    installDesktopApi({
      getArticle: vi.fn().mockResolvedValueOnce(article(annotation())).mockResolvedValue(null),
      onArticlePatched: vi.fn((callback: (patch: ArticleStorePatch) => void) => {
        emitPatch = callback;
        return vi.fn();
      }),
    });
    const events = windowEvents();
    bindAnnotationWindowArticle(route, events);
    await vi.waitFor(() => expect(events.loaded).toHaveBeenCalledOnce());

    emitPatch({ type: 'article-delete', articleId: 'article_1' });

    await vi.waitFor(() => expect(events.missing).toHaveBeenCalledOnce());
  });
});

function windowEvents() {
  return { failed: vi.fn(), loaded: vi.fn(), missing: vi.fn(), patched: vi.fn() };
}

function articleSummary(record: ArticleRecord): ArticleSummaryRecord {
  const {
    annotations: _annotations,
    contentHtml: _contentHtml,
    focusCoReadingPlan: _focusCoReadingPlan,
    readerChatState: _readerChatState,
    ...summary
  } = record;
  return { ...summary, counts: articleCounts(record) };
}

function installDesktopApi(desktop: {
  getArticle: ReturnType<typeof vi.fn>;
  onArticlePatched: ReturnType<typeof vi.fn>;
}) {
  Object.defineProperty(globalThis, 'yomitomoDesktop', {
    configurable: true,
    value: {
      article: {
        get: desktop.getArticle,
        onPatched: desktop.onArticlePatched,
      },
      store: {
        getState: vi.fn().mockResolvedValue({}),
      },
    },
  });
}

function annotation(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: 'annotation_1',
    anchor: { exact: 'Quote', prefix: '', suffix: '', start: 0, end: 5 },
    author: { kind: 'user', username: 'reader' },
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
