import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { computeAutoPdfZoom, pdfiumAnnotationRailLayout } from './pdfium-annotation-layout';
import {
  firstVisiblePdfPageWidth,
  pdfiumRailWheelHasLocalScrollTarget,
  pdfiumScrollSnapshotCanConsumeDelta,
  pdfiumWheelDeltaPixels,
  type PageMetric,
} from './pdfium-geometry';
import {
  debugComputedStyle,
  debugPdfLayout,
  debugRect,
  pdfLayoutDebugEnabled,
} from './pdfium-layout-debug';

export function usePdfiumReaderLayout({
  annotationCount,
  articleId,
  canvasRef,
  documentScale,
  notesRef,
  pageMetrics,
  pdfBaseWidth,
  requestZoom,
  schedulePageMetricsUpdate,
  surfaceRef,
  viewportHeight,
  viewportWidth,
  visibleAnnotationCount,
  zoom,
}: {
  annotationCount: number;
  articleId: string;
  canvasRef: RefObject<HTMLDivElement | null>;
  documentScale: number | undefined;
  notesRef: RefObject<HTMLElement | null>;
  pageMetrics: Record<number, PageMetric>;
  pdfBaseWidth: number;
  requestZoom: ((scale: number) => void) | undefined;
  schedulePageMetricsUpdate: () => void;
  surfaceRef: RefObject<HTMLElement | null>;
  viewportHeight: number;
  viewportWidth: number;
  visibleAnnotationCount: number;
  zoom: number;
}) {
  const [layoutPageWidth, setLayoutPageWidth] = useState(0);
  const resetLayoutPageWidthRef = useRef(true);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const appliedAutoZoomRef = useRef<number | null>(null);
  // EmbedPDF recreates its controls object during render, so effects must read its latest method
  // without treating that object identity as a zoom trigger.
  const requestZoomRef = useRef(requestZoom);
  requestZoomRef.current = requestZoom;

  useEffect(() => {
    const pageWidth = firstVisiblePdfPageWidth(pageMetrics);
    if (!pageWidth) return;
    const shouldReset = resetLayoutPageWidthRef.current;
    if (shouldReset) resetLayoutPageWidthRef.current = false;
    setLayoutPageWidth((current) => {
      const nextWidth = shouldReset || current <= 0 ? pageWidth : Math.min(current, pageWidth);
      return current === nextWidth ? current : nextWidth;
    });
  }, [pageMetrics]);

  const annotationRailLayout = useMemo(
    () =>
      pdfiumAnnotationRailLayout(
        pageMetrics,
        canvasRef.current,
        viewportHeight,
        viewportWidth,
        layoutPageWidth || undefined,
      ),
    [canvasRef, layoutPageWidth, pageMetrics, viewportHeight, viewportWidth],
  );

  useEffect(() => {
    if (!autoZoomEnabled) return;
    const scale = computeAutoPdfZoom({ viewportWidth, baseWidth: pdfBaseWidth });
    if (scale == null || appliedAutoZoomRef.current === scale) return;
    appliedAutoZoomRef.current = scale;
    requestZoomRef.current?.(scale);
  }, [autoZoomEnabled, pdfBaseWidth, viewportWidth]);

  useEffect(() => {
    if (annotationRailLayout) schedulePageMetricsUpdate();
  }, [annotationRailLayout?.mode, schedulePageMetricsUpdate]);

  useEffect(() => {
    if (!documentScale) return;
    resetLayoutPageWidthRef.current = true;
    schedulePageMetricsUpdate();
  }, [documentScale, schedulePageMetricsUpdate]);

  useEffect(() => {
    debugPdfLayout('debug-enabled', { articleId });
  }, [articleId]);

  useEffect(() => {
    if (!annotationRailLayout || !pdfLayoutDebugEnabled()) return;
    const pageWidth = firstVisiblePdfPageWidth(pageMetrics);
    debugPdfLayout('layout', {
      layoutPageWidth,
      mode: annotationRailLayout.mode,
      pageWidth,
      railWidth: annotationRailLayout.railWidth,
      rightRailLeft: annotationRailLayout.rightRailLeft,
      viewportWidth,
      zoom,
    });
  }, [annotationRailLayout, layoutPageWidth, pageMetrics, viewportWidth, zoom]);

  useEffect(() => {
    if (!pdfLayoutDebugEnabled()) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const surface = surfaceRef.current;
      const rail = notesRef.current;
      const empty = canvas?.querySelector<HTMLElement>('.reader-empty') ?? null;
      const viewport = canvas?.querySelector<HTMLElement>('.pdfium-spike-viewport') ?? null;
      const firstPage = canvas?.querySelector<HTMLElement>('[data-pdfium-page-index]') ?? null;
      const readerApp = canvas?.closest<HTMLElement>('.reader-app') ?? null;
      const readerMain = canvas?.closest<HTMLElement>('.reader-main') ?? null;
      const pdfReaderMain = canvas?.closest<HTMLElement>('.pdf-reader-main') ?? null;
      const shell = canvas?.closest<HTMLElement>('.source-pdf-reader-shell') ?? null;

      debugPdfLayout('empty-state', {
        annotationCount,
        appClasses: readerApp?.className ?? null,
        canvasRect: debugRect(canvas?.getBoundingClientRect()),
        emptyComputed: debugComputedStyle(empty),
        emptyExists: Boolean(empty),
        emptyRect: debugRect(empty?.getBoundingClientRect()),
        firstPageRect: debugRect(firstPage?.getBoundingClientRect()),
        layout: annotationRailLayout ?? null,
        layoutPageWidth,
        pageMetricKeys: Object.keys(pageMetrics),
        pdfReaderMainComputed: debugComputedStyle(pdfReaderMain),
        pdfReaderMainRect: debugRect(pdfReaderMain?.getBoundingClientRect()),
        railComputed: debugComputedStyle(rail),
        railRect: debugRect(rail?.getBoundingClientRect()),
        readerMainComputed: debugComputedStyle(readerMain),
        readerMainRect: debugRect(readerMain?.getBoundingClientRect()),
        shellComputed: debugComputedStyle(shell),
        shellRect: debugRect(shell?.getBoundingClientRect()),
        surfaceRect: debugRect(surface?.getBoundingClientRect()),
        viewportHeight,
        viewportRect: debugRect(viewport?.getBoundingClientRect()),
        viewportWidth,
        visibleAnnotationCount,
        zoom,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    annotationCount,
    annotationRailLayout,
    canvasRef,
    layoutPageWidth,
    notesRef,
    pageMetrics,
    surfaceRef,
    viewportHeight,
    viewportWidth,
    visibleAnnotationCount,
    zoom,
  ]);

  useEffect(() => {
    const rail = notesRef.current;
    if (!rail) return;
    const handleWheel = (event: WheelEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const viewport =
        canvasRef.current?.querySelector<HTMLElement>('.pdfium-spike-viewport') ?? null;
      if (!viewport) return;
      const delta = pdfiumWheelDeltaPixels(event, viewport.clientHeight);
      const viewportCanScroll =
        pdfiumScrollSnapshotCanConsumeDelta(
          {
            clientSize: viewport.clientHeight,
            scrollOffset: viewport.scrollTop,
            scrollSize: viewport.scrollHeight,
          },
          delta.y,
        ) ||
        pdfiumScrollSnapshotCanConsumeDelta(
          {
            clientSize: viewport.clientWidth,
            scrollOffset: viewport.scrollLeft,
            scrollSize: viewport.scrollWidth,
          },
          delta.x,
        );
      if (!viewportCanScroll || pdfiumRailWheelHasLocalScrollTarget(target, rail, delta)) return;
      event.preventDefault();
      viewport.scrollBy({ left: delta.x, top: delta.y, behavior: 'auto' });
    };
    rail.addEventListener('wheel', handleWheel, { passive: false });
    return () => rail.removeEventListener('wheel', handleWheel);
  }, [canvasRef, notesRef]);

  const disableAutoZoom = useCallback(() => setAutoZoomEnabled(false), []);
  return { annotationRailLayout, disableAutoZoom };
}
