// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import type { AnnotationDistillationCommittedEvent } from '../../../ipc-contract';
import { useReadingLibraryDistillationSync } from './use-reading-library-distillation-sync';
import { useReadingLibraryNavigation } from './use-reading-library-navigation';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

afterEach(() => {
  vi.useRealTimers();
});

describe('useReadingLibraryDistillationSync', () => {
  it('holds distillation-only article syncs for the commit event grace period', async () => {
    vi.useFakeTimers();
    const initialArticle = article();
    const publishedArticle = article({ annotation: publishedAnnotation });
    const { result } = renderDistillationSession(async () => initialArticle);
    await openArticle(result, initialArticle);

    act(() => result.current.sync.synchronizeArticle(initialArticle, publishedArticle));
    expect(currentDistillationStatus(result)).toBe('unpublished');

    await act(async () => vi.advanceTimersByTimeAsync(319));
    expect(currentDistillationStatus(result)).toBe('unpublished');
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(currentDistillationStatus(result)).toBe('published');
  });

  it('applies the latest deferred article after the morph completes', async () => {
    vi.useFakeTimers();
    const initialArticle = article();
    const publishedArticle = article({ annotation: publishedAnnotation });
    const { result } = renderDistillationSession(async () => publishedArticle);
    await openArticle(result, initialArticle);

    await act(async () => result.current.sync.onCommitted(publishEvent));
    act(() => result.current.sync.synchronizeArticle(initialArticle, publishedArticle));
    act(() => result.current.sync.onFocusedAnnotation());

    expect(result.current.sync.animation?.phase).toBe('morph-out');
    await act(async () => vi.advanceTimersByTimeAsync(16));
    expect(result.current.sync.animation?.phase).toBe('morph-in');
    await act(async () => vi.advanceTimersByTimeAsync(620));

    expect(result.current.sync.animation).toBeNull();
    expect(currentDistillationStatus(result)).toBe('published');
    expect(result.current.navigation.model.article?.updatedAt).toBe(publishedArticle.updatedAt);
  });

  it('ignores a committed article response superseded by a newer event', async () => {
    const first = createDeferred<ArticleRecord | null>();
    const second = createDeferred<ArticleRecord | null>();
    const { result } = renderDistillationSession((articleId) =>
      articleId === 'article_1' ? first.promise : second.promise,
    );
    let firstRequest!: Promise<void>;
    let secondRequest!: Promise<void>;

    act(() => {
      firstRequest = result.current.sync.onCommitted(publishEvent);
      secondRequest = result.current.sync.onCommitted({
        ...publishEvent,
        articleId: 'article_2',
      });
    });
    await act(async () => {
      second.resolve(article({ id: 'article_2' }));
      await secondRequest;
    });
    await act(async () => {
      first.resolve(article({ id: 'article_1' }));
      await firstRequest;
    });

    expect(result.current.navigation.model.article?.id).toBe('article_2');
    expect(result.current.navigation.model.focusAnnotationId).toBe('annotation_1');
  });

  it('cancels a pending commit focus after navigation resets', async () => {
    const pending = createDeferred<ArticleRecord | null>();
    const initialArticle = article();
    const { result } = renderDistillationSession(() => pending.promise);
    await openArticle(result, initialArticle);
    let committedRequest!: Promise<void>;

    act(() => {
      committedRequest = result.current.sync.onCommitted(publishEvent);
    });
    act(() => result.current.navigation.actions.resetLibrary());
    await act(async () => {
      pending.resolve(initialArticle);
      await committedRequest;
    });

    expect(result.current.navigation.model.routeType).toBe('library');
    expect(result.current.navigation.model.article).toBeNull();
  });

  it('clears grace timers on unmount', async () => {
    vi.useFakeTimers();
    const initialArticle = article();
    const publishedArticle = article({ annotation: publishedAnnotation });
    const { result, unmount } = renderDistillationSession(async () => initialArticle);
    await openArticle(result, initialArticle);
    act(() => result.current.sync.synchronizeArticle(initialArticle, publishedArticle));

    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

function renderDistillationSession(
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>,
) {
  return renderHook(() => {
    const navigation = useReadingLibraryNavigation({ onReadArticle });
    const sync = useReadingLibraryDistillationSync({ navigation, onReadArticle });
    return { navigation, sync };
  });
}

async function openArticle(
  result: ReturnType<typeof renderDistillationSession>['result'],
  value: ArticleRecord,
) {
  await act(async () => {
    await result.current.navigation.actions.openArticle(value);
  });
}

function currentDistillationStatus(result: ReturnType<typeof renderDistillationSession>['result']) {
  return result.current.navigation.model.article?.annotations[0]?.distillation?.status;
}

function article({
  annotation = unpublishedAnnotation,
  id = 'article_1',
}: {
  annotation?: Annotation;
  id?: string;
} = {}): ArticleRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    canonicalUrl: `https://example.com/${id}`,
    title: id,
    byline: '',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: `hash_${id}`,
    annotations: [annotation],
    annotationCount: 1,
    distillationCount: annotation.distillation?.status === 'published' ? 1 : 0,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt:
      annotation.distillation?.status === 'published'
        ? '2026-07-15T00:01:00.000Z'
        : '2026-07-15T00:00:00.000Z',
  };
}

const unpublishedAnnotation: Annotation = {
  id: 'annotation_1',
  anchor: { exact: '正文', prefix: '', suffix: '', start: 0, end: 2 },
  author: 'user',
  color: '#f4c95d',
  comments: [],
  distillation: {
    status: 'unpublished',
    content: '沉淀内容',
    updatedAt: '2026-07-15T00:00:00.000Z',
  },
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

const publishedAnnotation: Annotation = {
  ...unpublishedAnnotation,
  distillation: {
    ...unpublishedAnnotation.distillation!,
    status: 'published',
    publishedAt: '2026-07-15T00:01:00.000Z',
    updatedAt: '2026-07-15T00:01:00.000Z',
  },
  updatedAt: '2026-07-15T00:01:00.000Z',
};

const publishEvent: AnnotationDistillationCommittedEvent = {
  articleId: 'article_1',
  annotationId: 'annotation_1',
  distillation: publishedAnnotation.distillation,
  transition: 'publish',
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}
