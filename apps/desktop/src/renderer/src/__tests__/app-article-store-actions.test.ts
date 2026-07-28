// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { articleCounts } from '@yomitomo/core';
import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  Comment,
  DesktopStore,
} from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import {
  applyArticleStorePatch,
  applyArticleUpsertPatch,
  applyArticleDeletePatch,
  applyArticleReadingProgressPatch,
  useAppArticleStoreActions,
} from '../shell/app-article-store-actions';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
});

describe('useAppArticleStoreActions', () => {
  it('applies the merged agent annotation patch without a full article write', async () => {
    const firstArticle = makeArticle('article-1');
    const secondArticle = makeArticle('article-2');
    const annotation = makeAnnotation('agent-annotation');
    const savedSummary = articleSummary({
      ...firstArticle,
      annotations: [annotation],
      title: 'Merged article',
    });
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
    const mergeArticleAgentAnnotation = vi.fn().mockResolvedValue({
      activeId: annotation.id,
      patch: { type: 'article-upsert', article: savedSummary },
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { article: { mergeAgentAnnotation: mergeArticleAgentAnnotation } },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.mergeArticleAgentAnnotation(firstArticle.id, annotation);
    });

    expect(mergeArticleAgentAnnotation).toHaveBeenCalledWith({
      articleId: firstArticle.id,
      annotation,
    });
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
      value: { article: { importUrl: importArticleUrl } },
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
    expect(importArticleUrl).toHaveBeenCalledWith({
      url: 'https://example.com/imported',
      requestId: undefined,
    });
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [importedSummary, firstArticle],
    });
  });

  it('applies the saved annotation patch without a full store result', async () => {
    const firstArticle = makeArticle('article-1');
    const savedArticle = {
      ...firstArticle,
      annotations: [makeAnnotation('annotation-1')],
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    const savedSummary = articleSummary(savedArticle);
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
    const saveArticleAnnotation = vi.fn().mockResolvedValue({
      type: 'article-upsert',
      article: savedSummary,
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { article: { saveAnnotation: saveArticleAnnotation } },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.saveArticleAnnotation(
        'article-1',
        savedArticle.annotations[0],
        savedArticle.updatedAt,
      );
    });

    expect(saveArticleAnnotation).toHaveBeenCalledWith({
      articleId: 'article-1',
      annotation: savedArticle.annotations[0],
      updatedAt: savedArticle.updatedAt,
    });
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [savedSummary],
    });
  });

  it('applies the saved comment patch without a full store result', async () => {
    const firstArticle = makeArticle('article-1');
    const annotation = makeAnnotation('annotation-1');
    const comment = makeComment('comment-1');
    const savedArticle = {
      ...firstArticle,
      annotations: [{ ...annotation, comments: [comment] }],
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    const savedSummary = articleSummary(savedArticle);
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
    const saveArticleComment = vi.fn().mockResolvedValue({
      type: 'article-upsert',
      article: savedSummary,
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { article: { saveComment: saveArticleComment } },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.saveArticleComment('article-1', annotation.id, comment, savedArticle.updatedAt);
    });

    expect(saveArticleComment).toHaveBeenCalledWith({
      articleId: 'article-1',
      annotationId: annotation.id,
      comment,
      updatedAt: savedArticle.updatedAt,
    });
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [savedSummary],
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
      value: { article: { importUrl: importArticleUrl } },
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

  it('opens an annotation discussion window through desktop IPC', async () => {
    const storeRef: { current: DesktopStore } = { current: emptyStore };
    const applyStore = vi.fn();
    const openAnnotationDiscussion = vi.fn().mockResolvedValue({ reused: false, windowId: 3 });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { annotations: { discussion: { open: openAnnotationDiscussion } } },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.openArticleDiscussion('article-1', 'annotation-1');
    });

    expect(openAnnotationDiscussion).toHaveBeenCalledWith({
      articleId: 'article-1',
      annotationId: 'annotation-1',
    });
    expect(applyStore).not.toHaveBeenCalled();
  });

  it('closes article annotation discussion windows through desktop IPC', async () => {
    const storeRef: { current: DesktopStore } = { current: emptyStore };
    const applyStore = vi.fn();
    const closeArticleAnnotationDiscussions = vi.fn().mockResolvedValue({ closed: 2 });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: {
        annotations: { discussion: { closeArticle: closeArticleAnnotationDiscussions } },
      },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.closeArticleDiscussions('article-1');
    });

    expect(closeArticleAnnotationDiscussions).toHaveBeenCalledWith({ articleId: 'article-1' });
    expect(applyStore).not.toHaveBeenCalled();
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
      value: { article: { ebook: { importFile: importEbookFile } } },
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

  it('applies every committed text import patch to the store', async () => {
    const firstArticle = makeArticle('article-1');
    const firstImport = articleSummary(makeArticle('text-1'));
    const secondImport = articleSummary(makeArticle('text-2'));
    const storeRef: { current: DesktopStore } = {
      current: { ...emptyStore, articles: [firstArticle] },
    };
    const applyStore = vi.fn((store: DesktopStore) => {
      storeRef.current = store;
      return store;
    });
    const commitImport = vi.fn().mockResolvedValue({
      articles: [],
      patches: [
        { type: 'article-upsert', article: firstImport },
        { type: 'article-upsert', article: secondImport },
      ],
    });
    let actions!: ReturnType<typeof useAppArticleStoreActions>;

    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { article: { text: { commitImport } } },
    });
    render(
      createElement(function Harness() {
        actions = useAppArticleStoreActions({ storeRef, applyStore });
        return null;
      }),
    );

    await act(async () => {
      await actions.commitTextImport({
        items: [{ title: 'Imported', format: 'plain', body: 'body' }],
      });
    });

    // main excludes the sender from article:patched, so this result is the only way the
    // importing window learns about its own new articles.
    expect(applyStore).toHaveBeenCalledWith({
      ...emptyStore,
      articles: [secondImport, firstImport, firstArticle],
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
      kind: 'chapter' as const,
      chapterIndex: 1,
      chapterProgress: 0.3,
      bookProgress: 0.42,
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
      kind: 'page' as const,
      pageIndex: 2,
      pageCount: 12,
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
      collectionMembers: [
        {
          collectionId: 'collection_1',
          member: { kind: 'article', id: firstArticle.id },
          addedAt: '2026-06-21T00:00:00.000Z',
        },
        {
          collectionId: 'collection_1',
          member: { kind: 'article', id: secondArticle.id },
          addedAt: '2026-06-21T00:01:00.000Z',
        },
      ],
      pins: [
        {
          targetKind: 'article',
          targetId: firstArticle.id,
          pinnedAt: '2026-06-21T00:02:00.000Z',
        },
        {
          targetKind: 'article',
          targetId: secondArticle.id,
          pinnedAt: '2026-06-21T00:03:00.000Z',
        },
      ],
    };

    const nextStore = applyArticleDeletePatch(store, { articleId: firstArticle.id });

    expect(nextStore.articles).toEqual([secondArticle]);
    expect(nextStore.collectionMembers).toEqual([
      {
        collectionId: 'collection_1',
        member: { kind: 'article', id: secondArticle.id },
        addedAt: '2026-06-21T00:01:00.000Z',
      },
    ]);
    expect(nextStore.pins).toEqual([
      {
        targetKind: 'article',
        targetId: secondArticle.id,
        pinnedAt: '2026-06-21T00:03:00.000Z',
      },
    ]);
  });
});

type WebArticleSummary = Extract<ArticleSummaryRecord, { sourceType: 'web' }>;

function makeArticle(id: string): WebArticleSummary {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    sourceType: 'web',
    title: id,
    byline: '',
    siteName: 'Example',
    contentHash: `hash_${id}`,
    annotations: [],
    counts: {
      annotationCount: 0,
      thoughtCount: 0,
      discussionCommentCount: 0,
      aiCommentCount: 0,
      distillationCount: 0,
    },
    createdAt: '2026-05-17T07:00:00.000Z',
    updatedAt: '2026-05-17T07:00:00.000Z',
  };
}

function makeAnnotation(id: string): Annotation {
  return {
    id,
    anchor: {
      exact: 'highlight',
      prefix: '',
      suffix: '',
      start: 0,
      end: 9,
    },
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-17T07:30:00.000Z',
    updatedAt: '2026-05-17T07:30:00.000Z',
  };
}

function makeComment(id: string): Comment {
  return {
    id,
    author: { kind: 'user', username: 'reader' },
    content: 'comment',
    createdAt: '2026-05-17T07:45:00.000Z',
  };
}

type ArticleSummaryFixture = Omit<WebArticleSummary, 'annotations'> & {
  annotations: Annotation[];
  contentHtml?: string;
  focusCoReadingPlan?: ArticleRecord['focusCoReadingPlan'];
};

function articleSummary(article: ArticleSummaryFixture): WebArticleSummary {
  const {
    annotations,
    contentHtml: _contentHtml,
    focusCoReadingPlan: _focusCoReadingPlan,
    ...summary
  } = article;
  return {
    ...summary,
    annotations: [],
    counts: annotations.length > 0 ? articleCounts({ annotations }) : article.counts,
  };
}
