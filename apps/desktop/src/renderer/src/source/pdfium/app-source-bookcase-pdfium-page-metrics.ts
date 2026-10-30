import { createElement, useCallback, useReducer, useRef, type RefObject } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { samePageMetrics, type PageMetric } from './pdfium-geometry';

function pdfPageMetricsDebugEnabled() {
  try {
    return (
      (window as unknown as { yomitomoPdfLayoutDebug?: boolean }).yomitomoPdfLayoutDebug === true ||
      window.localStorage.getItem('yomitomo:pdf-layout-debug') === '1'
    );
  } catch {
    return false;
  }
}

type PdfPageMetricsState = {
  pageMetrics: Record<number, PageMetric>;
  viewportHeight: number;
  viewportWidth: number;
};

function pdfPageMetricsReducer(
  state: PdfPageMetricsState,
  event: { type: 'pageMetricsMeasured' } & PdfPageMetricsState,
): PdfPageMetricsState {
  const viewportHeight =
    Math.abs(state.viewportHeight - event.viewportHeight) < 0.5
      ? state.viewportHeight
      : event.viewportHeight;
  const viewportWidth =
    Math.abs(state.viewportWidth - event.viewportWidth) < 0.5
      ? state.viewportWidth
      : event.viewportWidth;
  const pageMetrics = samePageMetrics(state.pageMetrics, event.pageMetrics)
    ? state.pageMetrics
    : event.pageMetrics;
  if (
    viewportHeight === state.viewportHeight &&
    viewportWidth === state.viewportWidth &&
    pageMetrics === state.pageMetrics
  ) {
    return state;
  }
  return { pageMetrics, viewportHeight, viewportWidth };
}

export function usePdfiumPageMetrics({
  canvasRef,
  pageCount,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  pageCount: number;
}) {
  const pageMetricsFrameRef = useRef(0);
  const pageMetricsNeedsFollowupRef = useRef(false);
  const pageMetricsRef = useRef<Record<number, PageMetric>>({});
  const [
    {
      pageMetrics,
      viewportHeight: annotationRailViewportHeight,
      viewportWidth: annotationRailViewportWidth,
    },
    dispatch,
  ] = useReducer(pdfPageMetricsReducer, { pageMetrics: {}, viewportHeight: 0, viewportWidth: 0 });

  const updatePageMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = canvas
      .querySelector<HTMLElement>('.pdfium-spike-viewport')
      ?.getBoundingClientRect();
    const nextViewportHeight = Math.max(0, viewportRect?.height ?? canvasRect.height);
    const nextViewportWidth = Math.max(0, canvasRect.width);
    const nextMetrics: Record<number, PageMetric> = {};
    const pageElements = canvas.querySelectorAll<HTMLElement>('[data-pdfium-page-index]');
    for (const page of pageElements) {
      const pageIndex = Number(page.dataset.pdfiumPageIndex);
      if (!Number.isInteger(pageIndex)) continue;
      const rect = page.getBoundingClientRect();
      if (
        viewportRect &&
        (rect.bottom < viewportRect.top ||
          rect.top > viewportRect.bottom ||
          rect.right < viewportRect.left ||
          rect.left > viewportRect.right)
      ) {
        continue;
      }
      nextMetrics[pageIndex] = {
        left: rect.left - canvasRect.left,
        top: rect.top - canvasRect.top,
        width: rect.width,
        height: rect.height,
        clipLeft: (viewportRect?.left ?? canvasRect.left) - canvasRect.left,
        clipTop: (viewportRect?.top ?? canvasRect.top) - canvasRect.top,
        clipRight: (viewportRect?.right ?? canvasRect.right) - canvasRect.left,
        clipBottom: (viewportRect?.bottom ?? canvasRect.bottom) - canvasRect.top,
      };
    }
    if (pdfPageMetricsDebugEnabled()) {
      const readerMainRect = canvas.closest<HTMLElement>('.reader-main')?.getBoundingClientRect();
      const readerAppRect = canvas.closest<HTMLElement>('.reader-app')?.getBoundingClientRect();
      console.info('[yomitomo:pdf-layout] page-metrics', {
        canvasHeight: Math.round(canvasRect.height),
        metricKeys: Object.keys(nextMetrics),
        pageElementCount: pageElements.length,
        readerAppHeight: Math.round(readerAppRect?.height ?? 0),
        readerMainHeight: Math.round(readerMainRect?.height ?? 0),
        viewportHeight: Math.round(nextViewportHeight),
        viewportWidth: Math.round(nextViewportWidth),
      });
    }
    pageMetricsRef.current = nextMetrics;
    dispatch({
      type: 'pageMetricsMeasured',
      pageMetrics: nextMetrics,
      viewportHeight: nextViewportHeight,
      viewportWidth: nextViewportWidth,
    });
  }, [canvasRef]);

  const schedulePageMetricsUpdate = useCallback(() => {
    if (pageMetricsFrameRef.current) {
      pageMetricsNeedsFollowupRef.current = true;
      return;
    }
    pageMetricsFrameRef.current = window.requestAnimationFrame(() => {
      pageMetricsFrameRef.current = 0;
      updatePageMetrics();
      if (pageMetricsNeedsFollowupRef.current) {
        pageMetricsNeedsFollowupRef.current = false;
        schedulePageMetricsUpdate();
      }
    });
  }, [updatePageMetrics]);

  const observeCanvas = useCallback(
    (marker: HTMLElement | null) => {
      const canvas = canvasRef.current;
      if (!marker || !canvas) return;
      schedulePageMetricsUpdate();

      const viewport = canvas.querySelector<HTMLElement>('.pdfium-spike-viewport');
      viewport?.addEventListener('scroll', schedulePageMetricsUpdate, { passive: true });
      window.addEventListener('resize', schedulePageMetricsUpdate);

      const mutationObserver =
        typeof MutationObserver === 'undefined'
          ? null
          : new MutationObserver(schedulePageMetricsUpdate);
      mutationObserver?.observe(canvas, { childList: true, subtree: true });

      const resizeObserver =
        typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(schedulePageMetricsUpdate);
      resizeObserver?.observe(canvas);
      if (viewport) resizeObserver?.observe(viewport);

      return () => {
        if (pageMetricsFrameRef.current) {
          window.cancelAnimationFrame(pageMetricsFrameRef.current);
          pageMetricsFrameRef.current = 0;
        }
        pageMetricsNeedsFollowupRef.current = false;
        viewport?.removeEventListener('scroll', schedulePageMetricsUpdate);
        window.removeEventListener('resize', schedulePageMetricsUpdate);
        mutationObserver?.disconnect();
        resizeObserver?.disconnect();
      };
    },
    [canvasRef, schedulePageMetricsUpdate],
  );

  useMountEffect(() => () => {
    if (pageMetricsFrameRef.current) {
      window.cancelAnimationFrame(pageMetricsFrameRef.current);
      pageMetricsFrameRef.current = 0;
    }
    pageMetricsNeedsFollowupRef.current = false;
  });

  return {
    annotationRailViewportHeight,
    annotationRailViewportWidth,
    // Rendered after the reader canvas; a new page count re-scans the rendered pages.
    marker: createElement('span', { hidden: true, key: pageCount, ref: observeCanvas }),
    pageMetrics,
    pageMetricsRef,
    schedulePageMetricsUpdate,
    updatePageMetrics,
  };
}
