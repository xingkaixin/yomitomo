import { useEffect, useRef, type RefObject } from 'react';
import type { Annotation } from '@yomitomo/shared';
import { recordRendererPerformanceTiming } from '../../shell/app-renderer-performance';

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
  const boxCountRef = useRef(boxCount);
  const scrollToAnnotationRef = useRef(scrollToAnnotation);
  boxCountRef.current = boxCount;
  scrollToAnnotationRef.current = scrollToAnnotation;

  useEffect(() => {
    if (!focusAnnotationId) return;
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;
    const handleWheel = (event: WheelEvent) => {
      recordRendererPerformanceTiming('reader_scroll_input', {
        source: 'web',
        articleId,
        annotationId: focusAnnotationId,
        deltaY: event.deltaY,
        defaultPrevented: event.defaultPrevented,
        scrollTop: scrollElement.scrollTop,
        scrollHeight: scrollElement.scrollHeight,
        clientHeight: scrollElement.clientHeight,
      });
    };
    scrollElement.addEventListener('wheel', handleWheel, { passive: true });
    return () => scrollElement.removeEventListener('wheel', handleWheel);
  }, [articleId, focusAnnotationId, scrollRef]);

  useEffect(() => {
    if (!focusAnnotationId) return;
    const scrollElement = scrollRef.current;
    recordRendererPerformanceTiming('reader_focus', {
      source: 'web',
      phase: 'effect_start',
      articleId,
      annotationId: focusAnnotationId,
      annotationCount: annotationsRef.current.length,
      boxCount,
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
          articleId,
          annotationId: focusAnnotationId,
          scrollTop: currentScrollElement?.scrollTop ?? null,
        });
        onFocusedAnnotation(located);
      }, delayMs);
    };

    const attemptFocus = () => {
      if (cancelled) return;
      const currentScrollElement = scrollRef.current;
      const currentAnnotations = annotationsRef.current;
      if (!currentAnnotations.some((annotation) => annotation.id === focusAnnotationId)) {
        recordRendererPerformanceTiming('reader_focus', {
          source: 'web',
          phase: 'annotation_missing_consume',
          articleId,
          annotationId: focusAnnotationId,
          annotationCount: currentAnnotations.length,
          attemptCount,
        });
        onFocusedAnnotation(false);
        return;
      }

      const scrolled = scrollToAnnotationRef.current(focusAnnotationId);
      recordRendererPerformanceTiming('reader_focus', {
        source: 'web',
        phase: 'navigation_requested',
        articleId,
        annotationId: focusAnnotationId,
        scrolled,
        attemptCount,
        scrollTop: currentScrollElement?.scrollTop ?? null,
        boxCount: boxCountRef.current,
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
          articleId,
          annotationId: focusAnnotationId,
          attemptCount,
          boxCount: boxCountRef.current,
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
        articleId,
        annotationId: focusAnnotationId,
        scrollTop: scrollElement?.scrollTop ?? null,
      });
      cancelled = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [annotationsRef, articleId, focusAnnotationId, onFocusedAnnotation]);
}
