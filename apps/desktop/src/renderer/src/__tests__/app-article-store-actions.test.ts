// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ArticleRecord,
  ArticleStorePatch,
  ArticleSummaryRecord,
  DesktopStore,
  ReaderChatState,
} from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import {
  type ArticleStore,
  type CurrentArticleUpdate,
  useArticleStore,
} from '../shell/app-article-store';
import { useAppArticleStoreActions } from '../shell/app-article-store-actions';
import {
  annotationFixture,
  articleSummaryFromRecord,
  commentFixture,
  webArticleRecord,
} from './article-actions-test-utils';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'yomitomoDesktop');
  vi.clearAllMocks();
});

describe('useAppArticleStoreActions', () => {
  it('reconciles an agent annotation with the catalog and current article', async () => {
    const annotation = annotationFixture('agent-annotation', {
      author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
    });
    const initial = webArticleRecord('article-1');
    const optimisticCurrent = { ...initial, annotations: [annotation] };
    const saved = {
      ...optimisticCurrent,
      title: 'Merged article',
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    const second = webArticleRecord('article-2');
    const mergeAgentAnnotation = vi.fn().mockResolvedValue({
      activeId: annotation.id,
      patch: { type: 'article-upsert', article: articleSummaryFromRecord(saved) },
    });
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial), articleSummaryFromRecord(second)],
      currentArticle: optimisticCurrent,
      desktopApi: { article: { mergeAgentAnnotation } },
    });

    await act(async () => {
      await fixture.actions.mergeArticleAgentAnnotation(initial.id, annotation);
    });

    expect(mergeAgentAnnotation).toHaveBeenCalledWith({
      articleId: initial.id,
      annotation,
    });
    expect(fixture.storeRef.current.articles).toEqual([
      articleSummaryFromRecord(saved),
      articleSummaryFromRecord(second),
    ]);
    expect(fixture.getCurrentArticle()).toMatchObject({
      annotations: [annotation],
      updatedAt: saved.updatedAt,
    });
  });

  it('preserves newer annotation and comment state while an older save is in flight', async () => {
    const initial = webArticleRecord('article-1');
    const inputAnnotation = annotationFixture('annotation-1', { color: '#f4c95d' });
    const annotationSave = deferred<ArticleStorePatch | null>();
    const commentSave = deferred<ArticleStorePatch | null>();
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      currentArticle: { ...initial, annotations: [inputAnnotation] },
      desktopApi: {
        article: {
          saveAnnotation: vi.fn(() => annotationSave.promise),
          saveComment: vi.fn(() => commentSave.promise),
        },
      },
    });

    const pendingAnnotation = fixture.actions.saveArticleAnnotation(
      initial.id,
      inputAnnotation,
      inputAnnotation.updatedAt,
    );
    const newerComment = commentFixture('newer-comment', { content: 'arrived while saving' });
    const newerAnnotation = {
      ...inputAnnotation,
      color: '#99aa55',
      comments: [newerComment],
      updatedAt: '2026-05-17T08:01:00.000Z',
    };
    fixture.setCurrentArticle({
      ...initial,
      annotations: [newerAnnotation],
      updatedAt: newerAnnotation.updatedAt,
    });
    const annotationSavedAt = '2026-05-17T08:02:00.000Z';
    annotationSave.resolve({
      type: 'article-upsert',
      article: articleSummaryFromRecord({
        ...initial,
        annotations: [newerAnnotation],
        updatedAt: annotationSavedAt,
      }),
    });
    await act(async () => pendingAnnotation);

    expect(fixture.getCurrentArticle()?.annotations).toEqual([newerAnnotation]);
    expect(fixture.getCurrentArticle()?.updatedAt).toBe(annotationSavedAt);

    const inputComment = commentFixture('comment-1', { content: 'original' });
    const optimisticAnnotation = { ...newerAnnotation, comments: [inputComment] };
    fixture.setCurrentArticle({
      ...initial,
      annotations: [optimisticAnnotation],
      updatedAt: optimisticAnnotation.updatedAt,
    });
    const pendingComment = fixture.actions.saveArticleComment(
      initial.id,
      optimisticAnnotation.id,
      inputComment,
      optimisticAnnotation.updatedAt,
    );
    const editedComment = { ...inputComment, content: 'edited while saving' };
    const concurrentComment = commentFixture('comment-2', { content: 'concurrent' });
    const latestAnnotation = {
      ...optimisticAnnotation,
      comments: [editedComment, concurrentComment],
      updatedAt: '2026-05-17T08:03:00.000Z',
    };
    fixture.setCurrentArticle({
      ...initial,
      annotations: [latestAnnotation],
      updatedAt: latestAnnotation.updatedAt,
    });
    const commentSavedAt = '2026-05-17T08:04:00.000Z';
    commentSave.resolve({
      type: 'article-upsert',
      article: articleSummaryFromRecord({
        ...initial,
        annotations: [latestAnnotation],
        updatedAt: commentSavedAt,
      }),
    });
    await act(async () => pendingComment);

    expect(fixture.getCurrentArticle()?.annotations).toEqual([latestAnnotation]);
    expect(fixture.getCurrentArticle()?.updatedAt).toBe(commentSavedAt);
  });

  it('keeps comment and annotation deletes idempotent after reader optimistic changes', async () => {
    const annotation = annotationFixture('annotation-1');
    const initial = webArticleRecord('article-1', { annotations: [annotation] });
    const commentDeletedAt = '2026-05-17T08:00:00.000Z';
    const annotationDeletedAt = '2026-05-17T08:01:00.000Z';
    const deleteComment = vi.fn().mockResolvedValue({
      type: 'article-upsert',
      article: articleSummaryFromRecord({ ...initial, updatedAt: commentDeletedAt }),
    });
    const deleteAnnotation = vi.fn().mockResolvedValue({
      type: 'article-upsert',
      article: articleSummaryFromRecord({
        ...initial,
        annotations: [],
        updatedAt: annotationDeletedAt,
      }),
    });
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      currentArticle: initial,
      desktopApi: { article: { deleteAnnotation, deleteComment } },
    });

    await act(async () => {
      await fixture.actions.deleteArticleComment(initial.id, annotation.id, 'already-removed');
    });
    expect(fixture.getCurrentArticle()?.annotations).toEqual([
      { ...annotation, updatedAt: commentDeletedAt },
    ]);

    fixture.setCurrentArticle({ ...initial, annotations: [] });
    await act(async () => {
      await fixture.actions.deleteArticleAnnotation(initial.id, annotation.id);
    });
    expect(fixture.getCurrentArticle()).toMatchObject({
      annotations: [],
      updatedAt: annotationDeletedAt,
    });
  });

  it('uses normalized reading progress and the authoritative chat clear timestamp', async () => {
    const initial = webArticleRecord('article-1', {
      readerChatState: readerChatState('2026-05-17T07:30:00.000Z'),
    });
    const requestedProgress = {
      kind: 'scroll' as const,
      progress: 0.9,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    const normalizedProgress = {
      ...requestedProgress,
      progress: 0.75,
      updatedAt: '2026-05-17T08:00:01.000Z',
    };
    const chatClearedAt = '2026-05-17T08:01:00.000Z';
    const saveReadingProgress = vi.fn().mockResolvedValue({
      articleId: initial.id,
      readingProgress: normalizedProgress,
      updatedAt: normalizedProgress.updatedAt,
    });
    const saveReaderChatState = vi.fn().mockResolvedValue({
      type: 'article-reader-chat-state',
      articleId: initial.id,
      readerChatState: undefined,
      updatedAt: chatClearedAt,
    });
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      currentArticle: initial,
      desktopApi: { article: { saveReaderChatState, saveReadingProgress } },
    });

    await act(async () => {
      await fixture.actions.saveArticleReadingProgress(initial.id, requestedProgress);
    });
    expect(fixture.storeRef.current.articles[0]).toMatchObject({
      readingProgress: normalizedProgress,
      updatedAt: normalizedProgress.updatedAt,
    });
    expect(fixture.getCurrentArticle()).toMatchObject({
      readingProgress: normalizedProgress,
      updatedAt: normalizedProgress.updatedAt,
    });

    await act(async () => {
      await fixture.actions.saveArticleReaderChatState(initial.id, undefined);
    });
    expect(fixture.storeRef.current.articles[0]).toMatchObject({ updatedAt: chatClearedAt });
    expect(fixture.getCurrentArticle()).toMatchObject({ updatedAt: chatClearedAt });
    expect(fixture.getCurrentArticle()?.readerChatState).toBeUndefined();
  });

  it('keeps the article when delete persistence fails', async () => {
    const initial = webArticleRecord('article-1');
    const failure = new Error('delete failed');
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      currentArticle: initial,
      desktopApi: { article: { delete: vi.fn().mockRejectedValue(failure) } },
    });

    await expect(fixture.actions.deleteArticle(initial.id)).rejects.toBe(failure);

    expect(fixture.storeRef.current.articles).toEqual([articleSummaryFromRecord(initial)]);
    expect(fixture.getCurrentArticle()).toEqual(initial);
    expect(fixture.applyStore).not.toHaveBeenCalled();
  });

  it('removes the article after delete persistence succeeds', async () => {
    const initial = webArticleRecord('article-1');
    const persistence = deferred<{ articleId: string }>();
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      currentArticle: initial,
      desktopApi: { article: { delete: vi.fn(() => persistence.promise) } },
    });

    const mutation = fixture.actions.deleteArticle(initial.id);
    expect(fixture.storeRef.current.articles).toEqual([articleSummaryFromRecord(initial)]);
    expect(fixture.getCurrentArticle()).toEqual(initial);

    persistence.resolve({ articleId: initial.id });
    await mutation;

    expect(fixture.storeRef.current.articles).toEqual([]);
    expect(fixture.getCurrentArticle()).toBeNull();
    expect(fixture.applyStore).toHaveBeenCalledOnce();
  });

  it('reconciles URL, ebook, PDF, and ordered batch text imports', async () => {
    const initial = webArticleRecord('article-1');
    const importedUrl = webArticleRecord('url-import');
    const importedEbook = webArticleRecord('ebook-import');
    const importedPdf = webArticleRecord('pdf-import');
    const firstText = webArticleRecord('text-1');
    const secondText = webArticleRecord('text-2');
    const importUrl = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'imported',
        article: importedUrl,
        patch: { type: 'article-upsert', article: articleSummaryFromRecord(importedUrl) },
      })
      .mockResolvedValueOnce({ status: 'duplicate', article: importedUrl });
    const importEbook = vi.fn().mockResolvedValue({
      status: 'imported',
      article: importedEbook,
      patch: { type: 'article-upsert', article: articleSummaryFromRecord(importedEbook) },
    });
    const importPdf = vi.fn().mockResolvedValue({
      status: 'imported',
      article: importedPdf,
      patch: { type: 'article-upsert', article: articleSummaryFromRecord(importedPdf) },
    });
    const commitImport = vi.fn().mockResolvedValue({
      articles: [firstText, secondText],
      patches: [
        { type: 'article-upsert', article: articleSummaryFromRecord(firstText) },
        { type: 'article-upsert', article: articleSummaryFromRecord(secondText) },
      ],
    });
    const fixture = renderArticleActions({
      articles: [articleSummaryFromRecord(initial)],
      desktopApi: {
        article: {
          ebook: { importFile: importEbook },
          importUrl,
          pdf: { importFile: importPdf },
          text: { commitImport },
        },
      },
    });

    await act(async () => {
      await fixture.actions.importArticleUrl(importedUrl.url);
      await fixture.actions.importArticleUrl(importedUrl.url);
      await fixture.actions.importEbookFile(new File(['ebook'], 'book.epub'));
      await fixture.actions.importPdfFile(new File(['pdf'], 'paper.pdf'));
    });

    expect(importEbook).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'book.epub' }));
    expect(importPdf).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'paper.pdf' }));
    fixture.applyStore.mockClear();

    await act(async () => {
      await fixture.actions.commitTextImport({
        items: [{ title: 'Imported', format: 'plain', body: 'body' }],
      });
    });

    expect(fixture.applyStore).toHaveBeenCalledOnce();
    expect(fixture.storeRef.current.articles.map((article) => article.id)).toEqual([
      secondText.id,
      firstText.id,
      importedPdf.id,
      importedEbook.id,
      importedUrl.id,
      initial.id,
    ]);
  });

  it('keeps discussion window actions outside article reconciliation', async () => {
    const open = vi.fn().mockResolvedValue({ reused: false, windowId: 3 });
    const closeArticle = vi.fn().mockResolvedValue({ closed: 2 });
    const fixture = renderArticleActions({
      desktopApi: { annotations: { discussion: { closeArticle, open } } },
    });

    await act(async () => {
      await fixture.actions.openArticleDiscussion('article-1', 'annotation-1');
      await fixture.actions.closeArticleDiscussions('article-1');
    });

    expect(open).toHaveBeenCalledWith({
      articleId: 'article-1',
      annotationId: 'annotation-1',
    });
    expect(closeArticle).toHaveBeenCalledWith({ articleId: 'article-1' });
    expect(fixture.applyStore).not.toHaveBeenCalled();
  });
});

function renderArticleActions({
  articles = [],
  currentArticle = null,
  desktopApi,
}: {
  articles?: ArticleSummaryRecord[];
  currentArticle?: ArticleRecord | null;
  desktopApi: unknown;
}) {
  Object.defineProperty(window, 'yomitomoDesktop', {
    configurable: true,
    value: desktopApi,
  });
  const storeRef: { current: DesktopStore } = {
    current: { ...emptyStore, articles },
  };
  const applyStore = vi.fn((store: DesktopStore) => {
    storeRef.current = store;
    return store;
  });
  let actions!: ReturnType<typeof useAppArticleStoreActions>;
  let articleStore!: ArticleStore;
  let current = currentArticle;
  const applyCurrent = vi.fn((update: CurrentArticleUpdate) => {
    if (update.type === 'delete') {
      current = null;
      return;
    }
    if (current?.id === update.articleId) current = update.update(current);
  });

  render(
    createElement(function Harness() {
      articleStore = useArticleStore({ storeRef, applyStore });
      actions = useAppArticleStoreActions({ articleStore });
      return null;
    }),
  );
  articleStore.registerCurrentArticleSink({
    isCurrent: (articleId) => current?.id === articleId,
    apply: applyCurrent,
  });

  return {
    actions,
    applyStore,
    getCurrentArticle: () => current,
    setCurrentArticle: (article: ArticleRecord | null) => {
      current = article;
    },
    storeRef,
  };
}

function readerChatState(updatedAt: string): ReaderChatState {
  return {
    articleId: 'article-1',
    activeSessionId: 'session-1',
    sessions: [
      {
        id: 'session-1',
        articleId: 'article-1',
        createdAt: updatedAt,
        updatedAt,
        messages: [],
      },
    ],
    createdAt: updatedAt,
    updatedAt,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
