import { useCallback, type RefObject } from 'react';
import type React from 'react';
import type { HighlightBox } from '@yomitomo/core';
import type {
  HighlightChoice,
  PendingComposer,
  SelectionAction,
} from '@yomitomo/reader-ui/reader-app-view';
import {
  pdfiumHighlightChoicePosition,
  pdfiumHighlightHitAtClientPoint,
  pdfiumPageIndexFromTarget,
} from './app-source-bookcase-pdfium-utils';
import { suppressPdfiumContinuousTextSelectionEvent } from './app-source-bookcase-pdfium-selection-events';
import { debugPdfLayout, debugRect } from './pdfium-layout-debug';

type PdfiumHighlightHitTestingOptions = {
  boxes: HighlightBox[];
  canvasRef: RefObject<HTMLDivElement | null>;
  selectionAction: SelectionAction | null;
  composer: PendingComposer | null;
  onOpenAnnotation: (annotationId: string | null) => void;
  setHighlightChoice: React.Dispatch<React.SetStateAction<HighlightChoice | null>>;
};

type OpenPdfiumHighlightOptions = {
  fallbackAnnotationId?: string;
  pageIndex?: number | null;
  preferredAnnotationIds?: string[];
  source: 'highlight-button' | 'pdf-content';
  target?: Element | null;
};

function debugPoint(point: { x: number; y: number }) {
  return {
    x: Math.round(point.x),
    y: Math.round(point.y),
  };
}

function debugElement(element: Element | null) {
  if (!element) return null;
  return {
    className: element.getAttribute('class') ?? '',
    tagName: element.tagName.toLowerCase(),
  };
}

export function usePdfiumHighlightHitTesting({
  boxes,
  canvasRef,
  selectionAction,
  composer,
  onOpenAnnotation,
  setHighlightChoice,
}: PdfiumHighlightHitTestingOptions) {
  const openPdfiumHighlightAtClientPoint = useCallback(
    (clientX: number, clientY: number, options: OpenPdfiumHighlightOptions) => {
      if (selectionAction || composer) {
        debugPdfLayout('highlight-hit-test-skipped', {
          composerOpen: Boolean(composer),
          selectionActionOpen: Boolean(selectionAction),
          source: options.source,
        });
        return false;
      }

      const canvas = canvasRef.current;
      if (!canvas) {
        if (options.fallbackAnnotationId) onOpenAnnotation(options.fallbackAnnotationId);
        return Boolean(options.fallbackAnnotationId);
      }

      const canvasRect = canvas.getBoundingClientRect();
      const { annotationIds: ids, point } = pdfiumHighlightHitAtClientPoint({
        boxes,
        canvasRect,
        clientX,
        clientY,
        preferredAnnotationIds: options.preferredAnnotationIds,
      });

      debugPdfLayout('highlight-hit-test', {
        annotationIds: ids,
        canvasRect: debugRect(canvasRect),
        pageIndex: options.pageIndex,
        point: debugPoint(point),
        source: options.source,
        target: debugElement(options.target ?? null),
        totalBoxes: boxes.length,
      });

      if (ids.length === 0) return false;

      if (ids.length <= 1) {
        const annotationId = ids[0] || options.fallbackAnnotationId;
        if (!annotationId) return false;
        onOpenAnnotation(annotationId);
        return true;
      }

      setHighlightChoice({
        ...pdfiumHighlightChoicePosition(canvasRect.width, point),
        annotationIds: ids,
      });
      return true;
    },
    [boxes, canvasRef, composer, onOpenAnnotation, selectionAction, setHighlightChoice],
  );

  const handleHighlightClick = useCallback(
    (annotationId: string, event: React.MouseEvent<HTMLButtonElement>, annotationIds: string[]) =>
      openPdfiumHighlightAtClientPoint(event.clientX, event.clientY, {
        fallbackAnnotationId: annotationId,
        preferredAnnotationIds: annotationIds,
        source: 'highlight-button',
      }),
    [openPdfiumHighlightAtClientPoint],
  );

  const handlePdfiumCanvasClickCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (suppressPdfiumContinuousTextSelectionEvent(event)) return;
      if (event.button !== 0 || event.defaultPrevented) return;
      const target = event.target instanceof Element ? event.target : null;
      const handled = openPdfiumHighlightAtClientPoint(event.clientX, event.clientY, {
        pageIndex: pdfiumPageIndexFromTarget(target),
        source: 'pdf-content',
        target,
      });
      if (!handled) return;
      event.preventDefault();
    },
    [openPdfiumHighlightAtClientPoint],
  );

  return {
    handleHighlightClick,
    handlePdfiumCanvasClickCapture,
  };
}
