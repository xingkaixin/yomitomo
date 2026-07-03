import type React from 'react';
import { useEffect, useRef } from 'react';
import type { PdfEngine, PdfPageGeometry } from '@embedpdf/models';
import { isPdfTextAnchor } from '@yomitomo/shared';
import { selectionActionPosition, type HighlightBox } from '@yomitomo/core';
import type {
  SelectionAction,
  SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';
import {
  pdfiumSelectionAdjustedOffsets,
  pdfiumSelectionAnchorForOffsets,
  pdfiumSelectionDraggingHandle,
  pdfiumSelectionPointFromClientPoint,
  pdfiumTemporaryBoxes,
  type PageMetric,
  type PdfiumSelectionAdjustment,
} from './app-source-bookcase-pdfium-utils';

type PdfiumLoadedDocument = Parameters<PdfEngine['getPageGeometry']>[0] & {
  pages: (Parameters<PdfEngine['getPageGeometry']>[1] & {
    size: {
      height: number;
      width: number;
    };
  })[];
};

type PdfiumSelectionAdjustmentSource = {
  geometry: PdfPageGeometry;
  pageHeight: number;
  pageIndex: number;
  pageText: string;
  pageWidth: number;
};

type PdfiumSelectionAdjustmentState = PdfiumSelectionAdjustment & PdfiumSelectionAdjustmentSource;

type PdfiumSelectionAdjustmentOptions = {
  articleId: string;
  canvasRef: React.RefObject<HTMLDivElement | null>;
  contributorId: string;
  document: PdfiumLoadedDocument | undefined;
  engine: PdfEngine;
  extractPageText: (pageIndex: number) => Promise<string | null>;
  pageMetricsRef: React.RefObject<Record<number, PageMetric>>;
  selectionAction: SelectionAction | null;
  setSelectionAction: React.Dispatch<React.SetStateAction<SelectionAction | null>>;
  setTemporaryBoxes: React.Dispatch<React.SetStateAction<HighlightBox[]>>;
};

export function usePdfiumSelectionAdjustment({
  articleId,
  canvasRef,
  contributorId,
  document,
  engine,
  extractPageText,
  pageMetricsRef,
  selectionAction,
  setSelectionAction,
  setTemporaryBoxes,
}: PdfiumSelectionAdjustmentOptions) {
  const adjustmentRef = useRef<PdfiumSelectionAdjustmentState | null>(null);
  const requestRef = useRef(0);
  const sourceRef = useRef(new Map<number, PdfiumSelectionAdjustmentSource>());
  const geometryRef = useRef(new Map<number, Promise<PdfPageGeometry | null>>());

  useEffect(() => {
    adjustmentRef.current = null;
    requestRef.current += 1;
    sourceRef.current = new Map();
    geometryRef.current = new Map();
  }, [articleId, document]);

  function ensurePdfiumSelectionGeometry(pageIndex: number) {
    const cached = geometryRef.current.get(pageIndex);
    if (cached) return cached;

    const page = document?.pages[pageIndex];
    if (!document || !page) return Promise.resolve(null);

    const pending = engine
      .getPageGeometry(document, page)
      .toPromise()
      .catch(() => null);
    geometryRef.current.set(pageIndex, pending);
    return pending;
  }

  async function preparePdfiumSelectionAdjustmentSource(pageIndex: number) {
    const cached = sourceRef.current.get(pageIndex);
    if (cached) return cached;

    const page = document?.pages[pageIndex];
    if (!page) return null;

    const requestId = requestRef.current;
    const [geometry, pageText] = await Promise.all([
      ensurePdfiumSelectionGeometry(pageIndex),
      extractPageText(pageIndex),
    ]);
    if (requestId !== requestRef.current || !geometry || !pageText) return null;

    const adjustmentSource = {
      geometry,
      pageHeight: page.size.height,
      pageIndex,
      pageText,
      pageWidth: page.size.width,
    };
    sourceRef.current.set(pageIndex, adjustmentSource);
    return adjustmentSource;
  }

  function startPdfiumSelectionAdjustment(point: SelectionAdjustmentPointer) {
    const anchor = selectionAction?.anchor;
    if (
      !anchor ||
      !isPdfTextAnchor(anchor) ||
      !anchor.exact.trim() ||
      anchor.start === anchor.end
    ) {
      adjustmentRef.current = null;
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    adjustmentRef.current = null;

    const commitAdjustment = (adjustmentSource: PdfiumSelectionAdjustmentSource | null) => {
      if (!adjustmentSource || requestId !== requestRef.current) return;
      adjustmentRef.current = {
        ...adjustmentSource,
        endOffset: anchor.end,
        handle: point.handle,
        startOffset: anchor.start,
      };
    };

    const cached = sourceRef.current.get(anchor.pageIndex);
    if (cached) {
      commitAdjustment(cached);
      return;
    }

    void preparePdfiumSelectionAdjustmentSource(anchor.pageIndex).then(commitAdjustment);
  }

  function updatePdfiumSelectionAdjustment(point: SelectionAdjustmentPointer) {
    const adjustment = adjustmentRef.current;
    const canvas = canvasRef.current;
    if (!adjustment || adjustment.handle !== point.handle || !canvas) return;

    const metric = pageMetricsRef.current[adjustment.pageIndex];
    if (!metric) return;

    const targetPoint = pdfiumSelectionPointFromClientPoint({
      canvasRect: canvas.getBoundingClientRect(),
      clientX: point.clientX,
      clientY: point.clientY,
      geometry: adjustment.geometry,
      metric,
      pageHeight: adjustment.pageHeight,
      pageTextLength: adjustment.pageText.length,
      pageWidth: adjustment.pageWidth,
    });
    if (!targetPoint) return;

    const nextOffsets = pdfiumSelectionAdjustedOffsets({
      endOffset: adjustment.endOffset,
      handle: adjustment.handle,
      sourceOffset: targetPoint.sourceOffset,
      startOffset: adjustment.startOffset,
    });
    if (!nextOffsets) return;

    const anchor = pdfiumSelectionAnchorForOffsets({
      endOffset: nextOffsets.endOffset,
      geometry: adjustment.geometry,
      pageHeight: adjustment.pageHeight,
      pageIndex: adjustment.pageIndex,
      pageText: adjustment.pageText,
      pageWidth: adjustment.pageWidth,
      startOffset: nextOffsets.startOffset,
    });
    if (!anchor?.exact.trim()) return;

    const lastRect = anchor.rects[anchor.rects.length - 1];
    if (!lastRect) return;

    const lastDomRect = new DOMRect(
      metric.left + lastRect.x * metric.width,
      metric.top + lastRect.y * metric.height,
      Math.max(1, lastRect.width * metric.width),
      Math.max(2, lastRect.height * metric.height),
    );
    setSelectionAction({
      ...selectionActionPosition(lastDomRect, canvas.getBoundingClientRect()),
      anchor,
      adjustable: true,
      draggingHandle: pdfiumSelectionDraggingHandle(adjustment, targetPoint.sourceOffset),
    });
    setTemporaryBoxes(pdfiumTemporaryBoxes(anchor, metric, contributorId));
  }

  function finishPdfiumSelectionAdjustment(point: SelectionAdjustmentPointer) {
    updatePdfiumSelectionAdjustment(point);
    adjustmentRef.current = null;
    requestRef.current += 1;
    setSelectionAction((action) =>
      action?.draggingHandle ? { ...action, draggingHandle: undefined } : action,
    );
  }

  return {
    preparePdfiumSelectionAdjustmentSource,
    startPdfiumSelectionAdjustment,
    updatePdfiumSelectionAdjustment,
    finishPdfiumSelectionAdjustment,
  };
}
