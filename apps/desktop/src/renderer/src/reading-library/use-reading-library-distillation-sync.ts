import { useCallback, useMemo, useReducer, useRef } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import type { ResolvedAppSettings, ArticleRecord } from '@yomitomo/shared';
import type { AnnotationDistillationCommittedEvent } from '../../../ipc-contract';
import { playAppSoundEffect } from '../sound/app-sound-effects';
import {
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
} from '../shell/app-renderer-performance';
import {
  articleDistillationStateChanged,
  articleWithCommittedDistillation,
  articleWithDistillationAnimationStart,
  distillationOverlayForAnimation,
  nextDistillationAnimationArticleUpdatedAt,
  type ReadingLibraryDistillationAnimation,
} from './app-reading-library-distillation';
import {
  articleUpdateCanReplace,
  type ReadingLibraryNavigation,
} from './use-reading-library-navigation';

const DISTILLATION_SYNC_EVENT_GRACE_MS = 320;
const DISTILLATION_MORPH_PREPARE_MS = 16;
const DISTILLATION_MORPH_MS = 620;
const DISTILLATION_UPDATE_MS = 850;

type DistillationSyncLifecycle =
  | { status: 'idle'; token: number }
  | {
      status: 'loading-committed-article';
      token: number;
      event: AnnotationDistillationCommittedEvent;
      originArticleId: string | null;
      pendingArticle: ArticleRecord | null;
    }
  | {
      status: 'waiting-for-focus';
      token: number;
      event: AnnotationDistillationCommittedEvent;
      pendingArticle: ArticleRecord;
    }
  | {
      status: 'waiting-for-commit-event';
      token: number;
      articleId: string;
      article: ArticleRecord;
      timer: number;
    }
  | {
      status: 'animating';
      token: number;
      event: AnnotationDistillationCommittedEvent;
      pendingArticle: ArticleRecord;
      timer: number;
    };

type DistillationAnimationEvent =
  | { type: 'stopped' }
  | { type: 'phaseStarted'; animation: ReadingLibraryDistillationAnimation };

type UseReadingLibraryDistillationSyncOptions = {
  navigation: ReadingLibraryNavigation;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
  settings?: ResolvedAppSettings;
};

export function useReadingLibraryDistillationSync(
  options: UseReadingLibraryDistillationSyncOptions,
) {
  const readOptions = useStableCallback(() => options);
  const lifecycleRef = useRef<DistillationSyncLifecycle>({ status: 'idle', token: 0 });
  const reservedUpdatedAtRef = useRef(new Map<string, number>());
  const [animation, dispatchAnimation] = useReducer(distillationAnimation, null);

  const completeLifecycle = useCallback((token: number) => {
    const lifecycle = lifecycleRef.current;
    if (lifecycle.token !== token || lifecycle.status === 'idle') return;
    clearLifecycleTimer(lifecycle);
    lifecycleRef.current = { status: 'idle', token };
    dispatchAnimation({ type: 'stopped' });
    const pendingArticle = pendingLifecycleArticle(lifecycle);
    if (!pendingArticle) return;
    const { navigation } = readOptions();
    if (navigation.actions.isCurrentArticle(pendingArticle.id)) {
      navigation.actions.replaceArticle(pendingArticle);
    }
  }, []);

  const cancelLifecycle = useCallback(() => {
    const lifecycle = lifecycleRef.current;
    clearLifecycleTimer(lifecycle);
    lifecycleRef.current = { status: 'idle', token: lifecycle.token + 1 };
    dispatchAnimation({ type: 'stopped' });
  }, []);

  const onCommitted = useCallback(
    async (event: AnnotationDistillationCommittedEvent) => {
      const previousLifecycle = lifecycleRef.current;
      clearLifecycleTimer(previousLifecycle);
      const token = previousLifecycle.token + 1;
      const { navigation, onReadArticle } = readOptions();
      const startedAt = performance.now();
      lifecycleRef.current = {
        status: 'loading-committed-article',
        token,
        event,
        originArticleId: navigation.model.article?.id || null,
        pendingArticle: null,
      };
      dispatchAnimation({ type: 'stopped' });
      recordRendererPerformanceTiming('reader_focus', {
        source: 'library',
        phase: 'distillation_event_received',
        articleId: event.articleId,
        annotationId: event.annotationId,
        transition: event.transition,
      });

      const fullArticle = await onReadArticle(event.articleId);
      const loadingLifecycle = lifecycleRef.current;
      if (
        loadingLifecycle.status !== 'loading-committed-article' ||
        loadingLifecycle.token !== token
      ) {
        return;
      }
      if (!fullArticle) {
        completeLifecycle(token);
        recordRendererPerformanceTiming('reader_focus', {
          source: 'library',
          phase: 'distillation_article_missing',
          articleId: event.articleId,
          annotationId: event.annotationId,
          transition: event.transition,
          elapsedMs: rendererPerformanceElapsedMs(startedAt),
        });
        return;
      }

      const pendingArticle = newerArticle(fullArticle, loadingLifecycle.pendingArticle);
      lifecycleRef.current = {
        status: 'waiting-for-focus',
        token,
        event,
        pendingArticle,
      };
      const updatedAt = reserveAnimationUpdatedAt(
        reservedUpdatedAtRef.current,
        pendingArticle,
        event,
      );
      readOptions().navigation.actions.focusArticle(
        articleWithDistillationAnimationStart(pendingArticle, event, updatedAt),
        event.annotationId,
      );
      recordRendererPerformanceTiming('reader_focus', {
        source: 'library',
        phase: 'focus_set',
        articleId: pendingArticle.id,
        annotationId: event.annotationId,
        transition: event.transition,
        articleSourceType: pendingArticle.sourceType,
        annotationExists: pendingArticle.annotations.some(
          (annotation) => annotation.id === event.annotationId,
        ),
        elapsedMs: rendererPerformanceElapsedMs(startedAt),
      });
    },
    [completeLifecycle],
  );

  const onFocusedAnnotation = useCallback(() => {
    const { navigation, settings } = readOptions();
    const lifecycle = lifecycleRef.current;
    navigation.actions.consumeArticleFocus();
    recordRendererPerformanceTiming('reader_focus', {
      source: 'library',
      phase: 'focus_consumed',
      articleId: navigation.model.article?.id || null,
      annotationId: navigation.model.focusAnnotationId,
      pendingTransition:
        lifecycle.status === 'waiting-for-focus' ? lifecycle.event.transition : null,
    });
    if (lifecycle.status !== 'waiting-for-focus') return;

    const { event, token } = lifecycle;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'library',
      phase: 'distillation_animation_start',
      articleId: event.articleId,
      annotationId: event.annotationId,
      transition: event.transition,
      token,
    });
    if (event.transition !== 'unpublish') {
      playAppSoundEffect('reader.distillation_committed', settings || {});
    }

    if (event.transition === 'update') {
      navigation.actions.updateArticle(event.articleId, (article) =>
        articleWithCommittedDistillation(
          article,
          event,
          reserveAnimationUpdatedAt(reservedUpdatedAtRef.current, article, event),
        ),
      );
      dispatchAnimation({
        type: 'phaseStarted',
        animation: {
          annotationId: event.annotationId,
          transition: 'update',
          phase: 'update',
          token,
        },
      });
      const timer = window.setTimeout(() => completeLifecycle(token), DISTILLATION_UPDATE_MS);
      lifecycleRef.current = { ...lifecycle, status: 'animating', timer };
      return;
    }

    const overlayDistillation = distillationOverlayForAnimation(navigation.model.article, event);
    dispatchAnimation({
      type: 'phaseStarted',
      animation: {
        annotationId: event.annotationId,
        transition: event.transition,
        phase: 'morph-out',
        overlayDistillation,
        token,
      },
    });
    const timer = window.setTimeout(() => {
      const current = lifecycleRef.current;
      if (current.status !== 'animating' || current.token !== token) return;
      const currentNavigation = readOptions().navigation;
      currentNavigation.actions.updateArticle(event.articleId, (article) =>
        articleWithCommittedDistillation(
          article,
          event,
          reserveAnimationUpdatedAt(reservedUpdatedAtRef.current, article, event),
        ),
      );
      dispatchAnimation({
        type: 'phaseStarted',
        animation: {
          annotationId: event.annotationId,
          transition: event.transition,
          phase: 'morph-in',
          overlayDistillation,
          token,
        },
      });
      const morphTimer = window.setTimeout(() => completeLifecycle(token), DISTILLATION_MORPH_MS);
      lifecycleRef.current = { ...current, timer: morphTimer };
    }, DISTILLATION_MORPH_PREPARE_MS);
    lifecycleRef.current = { ...lifecycle, status: 'animating', timer };
  }, [completeLifecycle]);

  const acceptExternalArticle = useCallback((nextArticle: ArticleRecord) => {
    const { navigation } = readOptions();
    const currentArticle = navigation.actions.getCurrentArticle();
    if (!currentArticle || currentArticle.id !== nextArticle.id) return;
    const lifecycle = lifecycleRef.current;
    const baselineArticle = pendingLifecycleArticle(lifecycle) ?? currentArticle;
    if (!articleUpdateCanReplace(baselineArticle, nextArticle)) return;
    const blockedLifecycle = distillationSyncBlock(lifecycle, nextArticle.id);
    if (blockedLifecycle) {
      lifecycleRef.current = {
        ...blockedLifecycle,
        pendingArticle: nextArticle,
      };
      return;
    }

    clearLifecycleTimer(lifecycle);
    if (!articleDistillationStateChanged(currentArticle, nextArticle)) {
      lifecycleRef.current = { status: 'idle', token: lifecycle.token + 1 };
      navigation.actions.replaceArticle(nextArticle);
      return;
    }

    const token = lifecycle.token + 1;
    const timer = window.setTimeout(() => {
      const current = lifecycleRef.current;
      if (current.status !== 'waiting-for-commit-event' || current.token !== token) return;
      lifecycleRef.current = { status: 'idle', token };
      const currentNavigation = readOptions().navigation;
      if (currentNavigation.actions.isCurrentArticle(current.article.id)) {
        currentNavigation.actions.replaceArticle(current.article);
      }
    }, DISTILLATION_SYNC_EVENT_GRACE_MS);
    lifecycleRef.current = {
      status: 'waiting-for-commit-event',
      token,
      articleId: nextArticle.id,
      article: nextArticle,
      timer,
    };
  }, []);

  useMountEffect(() => {
    const unsubscribe = readOptions().navigation.actions.subscribeRoute((model, previous) => {
      const currentArticleId = model.article?.id || null;
      if (currentArticleId === (previous.article?.id || null)) return;
      const expectedArticleId = lifecycleArticleId(lifecycleRef.current);
      if (expectedArticleId === undefined || expectedArticleId === currentArticleId) return;
      cancelLifecycle();
    });
    return () => {
      unsubscribe();
      const lifecycle = lifecycleRef.current;
      clearLifecycleTimer(lifecycle);
      lifecycleRef.current = { status: 'idle', token: lifecycle.token + 1 };
    };
  });

  return useMemo(
    () => ({ acceptExternalArticle, animation, onCommitted, onFocusedAnnotation }),
    [acceptExternalArticle, animation, onCommitted, onFocusedAnnotation],
  );
}

function distillationAnimation(
  _animation: ReadingLibraryDistillationAnimation | null,
  event: DistillationAnimationEvent,
) {
  return event.type === 'stopped' ? null : event.animation;
}

function clearLifecycleTimer(lifecycle: DistillationSyncLifecycle) {
  if (lifecycle.status === 'waiting-for-commit-event' || lifecycle.status === 'animating') {
    window.clearTimeout(lifecycle.timer);
  }
}

function pendingLifecycleArticle(lifecycle: DistillationSyncLifecycle) {
  if (
    lifecycle.status === 'loading-committed-article' ||
    lifecycle.status === 'waiting-for-focus' ||
    lifecycle.status === 'animating' ||
    lifecycle.status === 'waiting-for-commit-event'
  ) {
    return lifecycle.status === 'waiting-for-commit-event'
      ? lifecycle.article
      : lifecycle.pendingArticle;
  }
  return null;
}

function newerArticle(article: ArticleRecord, candidate: ArticleRecord | null) {
  return candidate && articleUpdateCanReplace(article, candidate) ? candidate : article;
}

type BlockingDistillationSyncLifecycle = Extract<
  DistillationSyncLifecycle,
  { status: 'loading-committed-article' | 'waiting-for-focus' | 'animating' }
>;

function distillationSyncBlock(
  lifecycle: DistillationSyncLifecycle,
  articleId: string,
): BlockingDistillationSyncLifecycle | null {
  if (
    lifecycle.status !== 'loading-committed-article' &&
    lifecycle.status !== 'waiting-for-focus' &&
    lifecycle.status !== 'animating'
  ) {
    return null;
  }
  return lifecycle.event.articleId === articleId ? lifecycle : null;
}

function lifecycleArticleId(lifecycle: DistillationSyncLifecycle): string | null | undefined {
  switch (lifecycle.status) {
    case 'idle':
      return undefined;
    case 'loading-committed-article':
      return lifecycle.originArticleId;
    case 'waiting-for-commit-event':
      return lifecycle.articleId;
    case 'waiting-for-focus':
    case 'animating':
      return lifecycle.event.articleId;
  }
}

function reserveAnimationUpdatedAt(
  reservations: Map<string, number>,
  article: ArticleRecord,
  event: AnnotationDistillationCommittedEvent,
) {
  const previousUpdatedAt = reservations.get(article.id);
  const nextUpdatedAt = nextDistillationAnimationArticleUpdatedAt(
    article.updatedAt,
    event.distillation?.updatedAt,
    previousUpdatedAt,
  );
  reservations.set(article.id, Date.parse(nextUpdatedAt));
  return nextUpdatedAt;
}
