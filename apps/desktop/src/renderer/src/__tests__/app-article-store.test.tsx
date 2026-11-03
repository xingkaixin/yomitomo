// @vitest-environment jsdom

import { cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppSettingsPatch,
  ArticleRecord,
  ArticleSummaryRecord,
  DesktopStore,
} from '@yomitomo/shared';

import { emptyStore } from '../settings/app-settings';
import {
  type CurrentArticleSink,
  type CurrentArticleUpdate,
  createArticleStore,
} from '../shell/app-article-store';
import { articleSummaryFromRecord, webArticleRecord } from './article-actions-test-utils';
import { normalizeAppSettings } from '../../../settings/app-settings-normalization';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('createArticleStore', () => {
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
});

function renderArticleStore(
  articles: ArticleSummaryRecord[] = [],
  settings: AppSettingsPatch = {},
) {
  const storeRef: { current: DesktopStore } = {
    current: { ...emptyStore, articles, settings: normalizeAppSettings(settings) },
  };
  const applyStore = vi.fn((store: DesktopStore) => {
    storeRef.current = store;
    return store;
  });
  const articleStore = createArticleStore({ applyStore, getStore: () => storeRef.current });
  return { applyStore, articleStore, storeRef };
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}
