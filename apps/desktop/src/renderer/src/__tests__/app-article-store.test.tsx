// @vitest-environment jsdom

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ArticleRecord,
  ArticleReadingProgress,
  ArticleSummaryRecord,
  DesktopStore,
} from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import {
  articleStorePatchCommit,
  type CurrentArticleSink,
  type CurrentArticleUpdate,
  useArticleStore,
} from '../shell/app-article-store';
import { articleSummaryFromRecord, webArticleRecord } from './article-actions-test-utils';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useArticleStore', () => {
  it('projects article deletes onto both catalog and current article', () => {
    const deletion = { type: 'article-delete' as const, articleId: 'article-1' };

    expect(articleStorePatchCommit(deletion)).toEqual({
      patches: [deletion],
      current: { type: 'delete', articleId: deletion.articleId },
    });

    const progress = {
      type: 'article-reading-progress' as const,
      articleId: deletion.articleId,
      readingProgress: scrollProgress(0.5, '2026-05-17T08:00:00.000Z'),
      updatedAt: '2026-05-17T08:00:00.000Z',
    };
    expect(articleStorePatchCommit(progress)).toEqual({ patches: [progress] });
  });

  it('folds ordered patches once before updating the current article', () => {
    const initial = webArticleRecord('article-1');
    const imported = webArticleRecord('article-2');
    const fixture = renderArticleStore([articleSummaryFromRecord(initial)]);
    const events: string[] = [];
    let current: ArticleRecord = initial;
    fixture.applyStore.mockImplementation((store) => {
      events.push('store');
      fixture.storeRef.current = store;
      return store;
    });
    fixture.articleStore.registerCurrentArticleSink({
      isCurrent: (articleId) => articleId === current.id,
      apply: (update) => {
        events.push('current');
        expect(fixture.storeRef.current.articles.map((article) => article.id)).toEqual([
          imported.id,
          initial.id,
        ]);
        current = applyCurrentArticleUpdate(current, update);
      },
    });
    const progress = scrollProgress(0.6, '2026-05-17T08:02:00.000Z');

    const accepted = fixture.articleStore.commit({
      patches: [
        {
          type: 'article-upsert',
          article: articleSummaryFromRecord({
            ...initial,
            title: 'Updated title',
            updatedAt: '2026-05-17T08:01:00.000Z',
          }),
        },
        {
          type: 'article-reading-progress',
          articleId: initial.id,
          readingProgress: progress,
          updatedAt: progress.updatedAt,
        },
        {
          type: 'article-upsert',
          article: articleSummaryFromRecord(imported),
        },
      ],
      current: {
        type: 'update',
        articleId: initial.id,
        update: (article) => ({ ...article, readingProgress: progress }),
      },
    });

    expect(accepted).toBe(true);
    expect(fixture.applyStore).toHaveBeenCalledOnce();
    expect(events).toEqual(['store', 'current']);
    expect(fixture.storeRef.current.articles[1]).toMatchObject({
      id: initial.id,
      readingProgress: progress,
      title: 'Updated title',
      updatedAt: progress.updatedAt,
    });
    expect(current.readingProgress).toEqual(progress);
  });

  it('rejects catalog and current reconciliation while app lock is active', () => {
    const initial = webArticleRecord('article-1');
    const fixture = renderArticleStore([articleSummaryFromRecord(initial)], {
      appLockEnabled: true,
      appLockLocked: true,
    });
    const sink = currentArticleSink(initial);
    fixture.articleStore.registerCurrentArticleSink(sink);

    const accepted = fixture.articleStore.commit({
      patches: [{ type: 'article-delete', articleId: initial.id }],
      current: {
        type: 'update',
        articleId: initial.id,
        update: (article) => ({ ...article, title: 'Must not apply' }),
      },
    });

    expect(accepted).toBe(false);
    expect(fixture.applyStore).not.toHaveBeenCalled();
    expect(sink.apply).not.toHaveBeenCalled();
    expect(fixture.storeRef.current.articles).toEqual([articleSummaryFromRecord(initial)]);
  });

  it('keeps the newest sink across stale cleanup and ignores non-current articles', () => {
    const fixture = renderArticleStore();
    const firstSink = currentArticleSink(webArticleRecord('article-1'));
    const secondSink = currentArticleSink(webArticleRecord('article-2'));
    const unregisterFirst = fixture.articleStore.registerCurrentArticleSink(firstSink);
    const unregisterSecond = fixture.articleStore.registerCurrentArticleSink(secondSink);

    unregisterFirst();
    fixture.articleStore.commit({
      patches: [],
      current: currentTitleUpdate('article-1', 'Old route'),
    });
    fixture.articleStore.commit({
      patches: [],
      current: currentTitleUpdate('article-2', 'New route'),
    });

    expect(firstSink.apply).not.toHaveBeenCalled();
    expect(secondSink.apply).toHaveBeenCalledOnce();

    unregisterSecond();
    fixture.articleStore.commit({
      patches: [],
      current: currentTitleUpdate('article-2', 'After unmount'),
    });
    expect(secondSink.apply).toHaveBeenCalledOnce();
  });

  it('delivers deletes to pending sinks while ignoring non-current updates', () => {
    const fixture = renderArticleStore();
    const sink = {
      isCurrent: vi.fn(() => false),
      apply: vi.fn(),
    };
    fixture.articleStore.registerCurrentArticleSink(sink);

    fixture.articleStore.commit({
      patches: [],
      current: { type: 'delete', articleId: 'article-1' },
    });
    fixture.articleStore.commit({
      patches: [],
      current: currentTitleUpdate('article-1', 'Ignored'),
    });

    expect(sink.apply).toHaveBeenCalledOnce();
    expect(sink.apply).toHaveBeenCalledWith({
      type: 'delete',
      articleId: 'article-1',
    });
    expect(sink.isCurrent).toHaveBeenCalledOnce();
    expect(sink.isCurrent).toHaveBeenCalledWith('article-1');
  });

  it('does not reconcile an in-flight mutation after the app becomes locked', async () => {
    const initial = webArticleRecord('article-1');
    const fixture = renderArticleStore([articleSummaryFromRecord(initial)]);
    let current: ArticleRecord = initial;
    const sink = currentArticleSink(current, (update) => {
      current = applyCurrentArticleUpdate(current, update);
    });
    fixture.articleStore.registerCurrentArticleSink(sink);
    const persistence = deferred<ArticleReadingProgress>();
    const optimistic = scrollProgress(0.4, '2026-05-17T08:00:00.000Z');
    const authoritative = scrollProgress(0.3, '2026-05-17T08:01:00.000Z');

    const mutation = fixture.articleStore.runMutation({
      optimistic: readingProgressCommit(initial.id, optimistic),
      invoke: () => persistence.promise,
      reconcile: (progress) => readingProgressCommit(initial.id, progress),
    });
    expect(fixture.storeRef.current.articles[0].readingProgress).toEqual(optimistic);
    expect(current.readingProgress).toEqual(optimistic);

    fixture.storeRef.current = {
      ...fixture.storeRef.current,
      settings: { appLockEnabled: true, appLockLocked: true },
    };
    persistence.resolve(authoritative);
    await mutation;

    expect(fixture.applyStore).toHaveBeenCalledOnce();
    expect(sink.apply).toHaveBeenCalledOnce();
    expect(fixture.storeRef.current.articles[0].readingProgress).toEqual(optimistic);
    expect(current.readingProgress).toEqual(optimistic);
  });

  it('keeps a failed optimistic projection until an authoritative commit corrects it', async () => {
    const initial = webArticleRecord('article-1');
    const fixture = renderArticleStore([articleSummaryFromRecord(initial)]);
    const failure = new Error('persistence failed');
    const reconcile = vi.fn();

    await expect(
      fixture.articleStore.runMutation({
        optimistic: {
          patches: [{ type: 'article-delete', articleId: initial.id }],
        },
        invoke: () => Promise.reject(failure),
        reconcile,
      }),
    ).rejects.toBe(failure);

    expect(reconcile).not.toHaveBeenCalled();
    expect(fixture.storeRef.current.articles).toEqual([]);

    fixture.articleStore.commit({
      patches: [{ type: 'article-upsert', article: articleSummaryFromRecord(initial) }],
    });

    expect(fixture.storeRef.current.articles).toEqual([articleSummaryFromRecord(initial)]);
  });

  it('continues the reading-progress queue after surfacing the first failure', async () => {
    const fixture = renderArticleStore();
    const firstInvoke = deferred<string>();
    const order: string[] = [];
    const failure = new Error('first failed');

    const firstMutation = fixture.articleStore.runMutation({
      invoke: () => {
        order.push('first');
        return firstInvoke.promise;
      },
      reconcile: () => ({ patches: [] }),
      serialize: 'reading-progress',
    });
    const firstOutcome = firstMutation.catch((error: unknown) => error);
    const secondMutation = fixture.articleStore.runMutation({
      invoke: async () => {
        order.push('second');
        return 'saved';
      },
      reconcile: () => ({ patches: [] }),
      serialize: 'reading-progress',
    });

    await Promise.resolve();
    expect(order).toEqual(['first']);
    firstInvoke.reject(failure);
    expect(await firstOutcome).toBe(failure);
    await expect(secondMutation).resolves.toBe('saved');
    expect(order).toEqual(['first', 'second']);
  });

  it('removes article catalog, membership, and pin projections together', () => {
    const first = webArticleRecord('article-1');
    const second = webArticleRecord('article-2');
    const fixture = renderArticleStore([
      articleSummaryFromRecord(first),
      articleSummaryFromRecord(second),
    ]);
    fixture.storeRef.current = {
      ...fixture.storeRef.current,
      collectionMembers: [
        {
          collectionId: 'collection-1',
          member: { kind: 'article', id: first.id },
          addedAt: '2026-05-17T08:00:00.000Z',
        },
        {
          collectionId: 'collection-1',
          member: { kind: 'article', id: second.id },
          addedAt: '2026-05-17T08:01:00.000Z',
        },
      ],
      pins: [
        {
          targetKind: 'article',
          targetId: first.id,
          pinnedAt: '2026-05-17T08:02:00.000Z',
        },
        {
          targetKind: 'article',
          targetId: second.id,
          pinnedAt: '2026-05-17T08:03:00.000Z',
        },
      ],
    };

    fixture.articleStore.commit({
      patches: [{ type: 'article-delete', articleId: first.id }],
    });

    expect(fixture.storeRef.current.articles.map((article) => article.id)).toEqual([second.id]);
    expect(fixture.storeRef.current.collectionMembers).toHaveLength(1);
    expect(fixture.storeRef.current.collectionMembers[0].member).toEqual({
      kind: 'article',
      id: second.id,
    });
    expect(fixture.storeRef.current.pins).toHaveLength(1);
    expect(fixture.storeRef.current.pins[0]).toMatchObject({ targetId: second.id });
  });
});

function renderArticleStore(
  articles: ArticleSummaryRecord[] = [],
  settings: DesktopStore['settings'] = {},
) {
  const storeRef: { current: DesktopStore } = {
    current: { ...emptyStore, articles, settings },
  };
  const applyStore = vi.fn((store: DesktopStore) => {
    storeRef.current = store;
    return store;
  });
  const { result } = renderHook(() => useArticleStore({ applyStore, storeRef }));
  return { applyStore, articleStore: result.current, storeRef };
}

function currentArticleSink(
  article: ArticleRecord,
  onApply?: (update: CurrentArticleUpdate) => void,
): CurrentArticleSink & { apply: ReturnType<typeof vi.fn> } {
  return {
    isCurrent: (articleId) => articleId === article.id,
    apply: vi.fn(onApply),
  };
}

function applyCurrentArticleUpdate(article: ArticleRecord, update: CurrentArticleUpdate) {
  if (update.type === 'delete') throw new Error('cannot update a deleted article');
  return update.articleId === article.id ? update.update(article) : article;
}

function currentTitleUpdate(articleId: string, title: string): CurrentArticleUpdate {
  return {
    type: 'update',
    articleId,
    update: (article) => ({ ...article, title }),
  };
}

function readingProgressCommit(articleId: string, progress: ArticleReadingProgress) {
  return {
    patches: [
      {
        type: 'article-reading-progress' as const,
        articleId,
        readingProgress: progress,
        updatedAt: progress.updatedAt,
      },
    ],
    current: {
      type: 'update' as const,
      articleId,
      update: (article: ArticleRecord) => ({
        ...article,
        readingProgress: progress,
        updatedAt: progress.updatedAt,
      }),
    },
  };
}

function scrollProgress(progress: number, updatedAt: string): ArticleReadingProgress {
  return { kind: 'scroll', progress, updatedAt };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
