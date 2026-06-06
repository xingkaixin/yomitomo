import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { samePageMetrics, type PageMetric } from './app-source-bookcase-pdfium-utils';

export function usePdfiumPageMetrics({
  canvasRef,
  pageCount,
}: {
  canvasRef: RefObject<HTMLDivElement | null>;
  pageCount: number;
}) {
  const pageMetricsFrameRef = useRef(0);
  const pageMetricsRef = useRef<Record<number, PageMetric>>({});
  const [pageMetrics, setPageMetrics] = useState<Record<number, PageMetric>>({});
  const [annotationRailViewportHeight, setAnnotationRailViewportHeight] = useState(0);
  const [annotationRailViewportWidth, setAnnotationRailViewportWidth] = useState(0);

  const updatePageMetrics = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    const viewportRect = canvas
      .querySelector<HTMLElement>('.pdfium-spike-viewport')
      ?.getBoundingClientRect();
    const nextViewportHeight = Math.max(0, viewportRect?.height ?? canvasRect.height);
    const nextViewportWidth = Math.max(0, canvasRect.width);
    setAnnotationRailViewportHeight((current) =>
      Math.abs(current - nextViewportHeight) < 0.5 ? current : nextViewportHeight,
    );
    setAnnotationRailViewportWidth((current) =>
      Math.abs(current - nextViewportWidth) < 0.5 ? current : nextViewportWidth,
    );
    const nextMetrics: Record<number, PageMetric> = {};
    for (const page of canvas.querySelectorAll<HTMLElement>('[data-pdfium-page-index]')) {
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
    pageMetricsRef.current = nextMetrics;
    setPageMetrics((current) => (samePageMetrics(current, nextMetrics) ? current : nextMetrics));
  }, [canvasRef]);

  const schedulePageMetricsUpdate = useCallback(() => {
    if (pageMetricsFrameRef.current) return;
    pageMetricsFrameRef.current = window.requestAnimationFrame(() => {
      pageMetricsFrameRef.current = 0;
      updatePageMetrics();
    });
  }, [updatePageMetrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedulePageMetricsUpdate);
    resizeObserver?.observe(canvas);
    if (viewport) resizeObserver?.observe(viewport);

    return () => {
      if (pageMetricsFrameRef.current) {
        window.cancelAnimationFrame(pageMetricsFrameRef.current);
        pageMetricsFrameRef.current = 0;
      }
      viewport?.removeEventListener('scroll', schedulePageMetricsUpdate);
      window.removeEventListener('resize', schedulePageMetricsUpdate);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [canvasRef, pageCount, schedulePageMetricsUpdate]);

  useEffect(() => {
    return () => {
      if (pageMetricsFrameRef.current) {
        window.cancelAnimationFrame(pageMetricsFrameRef.current);
        pageMetricsFrameRef.current = 0;
      }
    };
  }, []);

  return {
    annotationRailViewportHeight,
    annotationRailViewportWidth,
    pageMetrics,
    pageMetricsRef,
    schedulePageMetricsUpdate,
    updatePageMetrics,
  };
}
