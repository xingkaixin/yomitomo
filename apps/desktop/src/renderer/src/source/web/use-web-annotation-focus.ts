import { createElement, useCallback, useEffectEvent, type RefObject } from 'react';
import type { Annotation } from '@yomitomo/shared';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';

const completionCallbackIds = new WeakMap<object, number>();
let nextCompletionCallbackId = 0;

export function useWebAnnotationFocus({
  annotationsRef,
  articleId,
  boxCount,
  focusAnnotationId,
  onFocusedAnnotation,
  scrollRef,
  scrollToAnnotation,
}: {
  annotationsRef: RefObject<Annotation[]>;
  articleId: string;
  boxCount: number;
  focusAnnotationId: string | null | undefined;
  onFocusedAnnotation: (located: boolean) => void;
  scrollRef: RefObject<HTMLElement | null>;
  scrollToAnnotation: (annotationId: string) => boolean;
}) {
  const readInput = useEffectEvent(() => ({
    articleId,
    boxCount,
    focusAnnotationId,
    onFocusedAnnotation,
    scrollToAnnotation,
  }));

  const attachFocusRequest = useCallback(
    (marker: HTMLElement | null) => {
      const request = readInput();
      const { articleId: requestArticleId, focusAnnotationId: annotationId } = request;
      const scrollElement = scrollRef.current;
      if (!marker || !annotationId) return;

      const handleWheel = (event: WheelEvent) => {
        if (!scrollElement) return;
        recordRendererPerformanceTiming('reader_scroll_input', {
          source: 'web',
          articleId: requestArticleId,
          annotationId,
          deltaY: event.deltaY,
          defaultPrevented: event.defaultPrevented,
          scrollTop: scrollElement.scrollTop,
          scrollHeight: scrollElement.scrollHeight,
          clientHeight: scrollElement.clientHeight,
        });
      };
      scrollElement?.addEventListener('wheel', handleWheel, { passive: true });

      recordRendererPerformanceTiming('reader_focus', {
        source: 'web',
        phase: 'effect_start',
        articleId: requestArticleId,
        annotationId,
        annotationCount: annotationsRef.current.length,
        boxCount: request.boxCount,
        hasScrollElement: Boolean(scrollElement),
        scrollTop: scrollElement?.scrollTop ?? null,
        scrollHeight: scrollElement?.scrollHeight ?? null,
        clientHeight: scrollElement?.clientHeight ?? null,
      });
      const maxAttemptCount = 30;
      let attemptCount = 0;
      let cancelled = false;
      let frame: number | null = null;
      let timer: number | null = null;

      const completeFocus = (phase: string, delayMs: number, located: boolean) => {
        timer = window.setTimeout(() => {
          if (cancelled) return;
          const currentScrollElement = scrollRef.current;
          recordRendererPerformanceTiming('reader_focus', {
            source: 'web',
            phase,
            articleId: requestArticleId,
            annotationId,
            scrollTop: currentScrollElement?.scrollTop ?? null,
          });
          request.onFocusedAnnotation(located);
        }, delayMs);
      };

      const attemptFocus = () => {
        if (cancelled) return;
        const currentScrollElement = scrollRef.current;
        const currentAnnotations = annotationsRef.current;
        if (!currentAnnotations.some((annotation) => annotation.id === annotationId)) {
          recordRendererPerformanceTiming('reader_focus', {
            source: 'web',
            phase: 'annotation_missing_consume',
            articleId: requestArticleId,
            annotationId,
            annotationCount: currentAnnotations.length,
            attemptCount,
          });
          request.onFocusedAnnotation(false);
          return;
        }

        const current = readInput();
        const scrolled = current.scrollToAnnotation(annotationId);
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase: 'navigation_requested',
          articleId: requestArticleId,
          annotationId,
          scrolled,
          attemptCount,
          scrollTop: currentScrollElement?.scrollTop ?? null,
          boxCount: current.boxCount,
        });
        if (scrolled) {
          completeFocus('complete_timer', 520, true);
          return;
        }

        attemptCount += 1;
        if (attemptCount >= maxAttemptCount) {
          recordRendererPerformanceTiming('reader_focus', {
            source: 'web',
            phase: 'navigation_unavailable_consume',
            articleId: requestArticleId,
            annotationId,
            attemptCount,
            boxCount: current.boxCount,
          });
          completeFocus('unavailable_complete', 0, false);
          return;
        }
        frame = window.requestAnimationFrame(attemptFocus);
      };

      frame = window.requestAnimationFrame(attemptFocus);
      return () => {
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase: 'effect_cleanup',
          articleId: requestArticleId,
          annotationId,
          scrollTop: scrollElement?.scrollTop ?? null,
        });
        cancelled = true;
        scrollElement?.removeEventListener('wheel', handleWheel);
        if (frame !== null) window.cancelAnimationFrame(frame);
        if (timer !== null) window.clearTimeout(timer);
      };
    },
    [annotationsRef, scrollRef],
  );

  if (!focusAnnotationId) return null;
  return createElement('span', {
    hidden: true,
    // A new completion callback starts a new focus request, so the request rechecks its target.
    key: `${articleId}\n${focusAnnotationId}\n${completionCallbackId(onFocusedAnnotation)}`,
    ref: attachFocusRequest,
  });
}

function completionCallbackId(callback: object) {
  let id = completionCallbackIds.get(callback);
  if (id === undefined) {
    nextCompletionCallbackId += 1;
    id = nextCompletionCallbackId;
    completionCallbackIds.set(callback, id);
  }
  return id;
}
