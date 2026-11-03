// @vitest-environment jsdom

import { createElement } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ArticleRecord,
  ArticleStorePatch,
  ArticleSummaryRecord,
  DesktopStore,
} from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import { type CurrentArticleUpdate, createArticleStore } from '../shell/app-article-store';
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
  const articleStore = createArticleStore({ applyStore, getStore: () => storeRef.current });
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
