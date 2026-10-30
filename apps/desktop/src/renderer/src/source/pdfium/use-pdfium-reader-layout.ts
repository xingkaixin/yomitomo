import {
  createElement,
  useCallback,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  type RefObject,
} from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
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

type PdfReaderLayoutState = {
  autoZoomEnabled: boolean;
  documentScale: number | undefined;
  layoutPageWidth: number;
  pageMetrics: Record<number, PageMetric> | null;
  resetLayoutPageWidth: boolean;
};

type PdfReaderLayoutEvent =
  | {
      type: 'layoutInputsChanged';
      documentScale: number | undefined;
      pageMetrics: Record<number, PageMetric>;
    }
  | { type: 'zoomChangedByUser' };

const initialPdfReaderLayoutState: PdfReaderLayoutState = {
  autoZoomEnabled: true,
  documentScale: undefined,
  layoutPageWidth: 0,
  pageMetrics: null,
  resetLayoutPageWidth: true,
};

function pdfReaderLayoutReducer(
  state: PdfReaderLayoutState,
  event: PdfReaderLayoutEvent,
): PdfReaderLayoutState {
  if (event.type === 'zoomChangedByUser') {
    return state.autoZoomEnabled ? { ...state, autoZoomEnabled: false } : state;
  }
  let { layoutPageWidth, resetLayoutPageWidth } = state;
  if (event.pageMetrics !== state.pageMetrics) {
    const pageWidth = firstVisiblePdfPageWidth(event.pageMetrics);
    if (pageWidth) {
      layoutPageWidth =
        resetLayoutPageWidth || layoutPageWidth <= 0
          ? pageWidth
          : Math.min(layoutPageWidth, pageWidth);
      resetLayoutPageWidth = false;
    }
  }
  // A new zoom scale lets the next measured page width replace the narrowest one seen so far.
  if (event.documentScale !== state.documentScale && event.documentScale) {
    resetLayoutPageWidth = true;
  }
  return {
    ...state,
    documentScale: event.documentScale,
    layoutPageWidth,
    pageMetrics: event.pageMetrics,
    resetLayoutPageWidth,
  };
}

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
  const [layout, dispatch] = useReducer(
    pdfReaderLayoutReducer,
    { documentScale, pageMetrics },
    (inputs) =>
      pdfReaderLayoutReducer(initialPdfReaderLayoutState, {
        type: 'layoutInputsChanged',
        ...inputs,
      }),
  );
  if (layout.pageMetrics !== pageMetrics || layout.documentScale !== documentScale) {
    dispatch({ type: 'layoutInputsChanged', documentScale, pageMetrics });
  }
  const { autoZoomEnabled, layoutPageWidth } = layout;
  const appliedAutoZoomRef = useRef<number | null>(null);
  // EmbedPDF recreates its controls object during render, so markers read its latest method
  // without treating that object identity as a zoom trigger.
  const zoomRequested = useEffectEvent((scale: number) => requestZoom?.(scale));

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
  const autoZoomScale = autoZoomEnabled
    ? computeAutoPdfZoom({ viewportWidth, baseWidth: pdfBaseWidth })
    : null;
  const readAutoZoomScale = useEffectEvent(() => autoZoomScale);

  const applyAutoZoom = useCallback((marker: HTMLElement | null) => {
    const scale = readAutoZoomScale();
    if (!marker || scale == null || appliedAutoZoomRef.current === scale) return;
    appliedAutoZoomRef.current = scale;
    zoomRequested(scale);
  }, []);

  const remeasurePages = useCallback(
    (marker: HTMLElement | null) => {
      if (marker) schedulePageMetricsUpdate();
    },
    [schedulePageMetricsUpdate],
  );

  useMountEffect(() => {
    debugPdfLayout('debug-enabled', { articleId });
  });

  const readDebugInput = useEffectEvent(() => ({
    annotationCount,
    annotationRailLayout,
    layoutPageWidth,
    pageMetrics,
    viewportHeight,
    viewportWidth,
    visibleAnnotationCount,
    zoom,
  }));

  const logLayout = useCallback(
    (marker: HTMLElement | null) => {
      if (!marker) return;
      const input = readDebugInput();
      if (input.annotationRailLayout) {
        debugPdfLayout('layout', {
          layoutPageWidth: input.layoutPageWidth,
          mode: input.annotationRailLayout.mode,
          pageWidth: firstVisiblePdfPageWidth(input.pageMetrics),
          railWidth: input.annotationRailLayout.railWidth,
          rightRailLeft: input.annotationRailLayout.rightRailLeft,
          viewportWidth: input.viewportWidth,
          zoom: input.zoom,
        });
      }
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
          annotationCount: input.annotationCount,
          appClasses: readerApp?.className ?? null,
          canvasRect: debugRect(canvas?.getBoundingClientRect()),
          emptyComputed: debugComputedStyle(empty),
          emptyExists: Boolean(empty),
          emptyRect: debugRect(empty?.getBoundingClientRect()),
          firstPageRect: debugRect(firstPage?.getBoundingClientRect()),
          layout: input.annotationRailLayout ?? null,
          layoutPageWidth: input.layoutPageWidth,
          pageMetricKeys: Object.keys(input.pageMetrics),
          pdfReaderMainComputed: debugComputedStyle(pdfReaderMain),
          pdfReaderMainRect: debugRect(pdfReaderMain?.getBoundingClientRect()),
          railComputed: debugComputedStyle(rail),
          railRect: debugRect(rail?.getBoundingClientRect()),
          readerMainComputed: debugComputedStyle(readerMain),
          readerMainRect: debugRect(readerMain?.getBoundingClientRect()),
          shellComputed: debugComputedStyle(shell),
          shellRect: debugRect(shell?.getBoundingClientRect()),
          surfaceRect: debugRect(surface?.getBoundingClientRect()),
          viewportHeight: input.viewportHeight,
          viewportRect: debugRect(viewport?.getBoundingClientRect()),
          viewportWidth: input.viewportWidth,
          visibleAnnotationCount: input.visibleAnnotationCount,
          zoom: input.zoom,
        });
      });
      return () => window.cancelAnimationFrame(frame);
    },
    [canvasRef, notesRef, surfaceRef],
  );

  const attachRailWheel = useCallback(
    (marker: HTMLElement | null) => {
      const rail = notesRef.current;
      if (!marker || !rail) return;
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
    },
    [canvasRef, notesRef],
  );

  const disableAutoZoom = useCallback(() => dispatch({ type: 'zoomChangedByUser' }), []);
  const debugLayoutKey = pdfLayoutDebugEnabled()
    ? JSON.stringify([
        annotationCount,
        annotationRailLayout ?? null,
        layoutPageWidth,
        pageMetrics,
        viewportHeight,
        viewportWidth,
        visibleAnnotationCount,
        zoom,
      ])
    : null;

  return {
    annotationRailLayout,
    disableAutoZoom,
    // Rendered after the reader surface so the canvas and annotation rail exist when they attach.
    markers: [
      autoZoomScale == null
        ? null
        : createElement('span', { hidden: true, key: `zoom:${autoZoomScale}`, ref: applyAutoZoom }),
      annotationRailLayout
        ? createElement('span', {
            hidden: true,
            key: `rail:${annotationRailLayout.mode}`,
            ref: remeasurePages,
          })
        : null,
      documentScale
        ? createElement('span', {
            hidden: true,
            key: `scale:${documentScale}`,
            ref: remeasurePages,
          })
        : null,
      debugLayoutKey === null
        ? null
        : createElement('span', { hidden: true, key: `debug:${debugLayoutKey}`, ref: logLayout }),
      createElement('span', { hidden: true, key: 'rail-wheel', ref: attachRailWheel }),
    ],
  };
}
