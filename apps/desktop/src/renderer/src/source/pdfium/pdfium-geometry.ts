import type { PdfPageGeometry } from '@embedpdf/models';
import type { SelectionAdjustmentHandle } from '@yomitomo/reader-ui/reader-app-view';
import { createPdfTextAnchor, type PdfRect } from '@yomitomo/shared';
import { annotationIdsAtHighlightPoint, type HighlightBox } from '@yomitomo/core';

export type PageMetric = {
  left: number;
  top: number;
  width: number;
  height: number;
  clipLeft: number;
  clipTop: number;
  clipRight: number;
  clipBottom: number;
};

export type PdfPageGeometryEntry = {
  geometry: PdfPageGeometry;
  width: number;
  height: number;
};

export type PdfiumCanvasPoint = {
  x: number;
  y: number;
};

export type PdfiumSelectionAdjustment = {
  endOffset: number;
  handle: SelectionAdjustmentHandle;
  startOffset: number;
};

export type PdfiumSelectionPoint = {
  sourceOffset: number;
};

export type PdfiumWheelDelta = {
  x: number;
  y: number;
};

export type PdfiumScrollSnapshot = {
  clientSize: number;
  scrollOffset: number;
  scrollSize: number;
};

const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;
const WHEEL_LINE_HEIGHT = 16;
const SCROLL_EDGE_EPSILON = 1;

export function pdfiumWheelDeltaPixels(
  event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>,
  pageSize: number,
): PdfiumWheelDelta {
  const deltaScale =
    event.deltaMode === WHEEL_DELTA_LINE
      ? WHEEL_LINE_HEIGHT
      : event.deltaMode === WHEEL_DELTA_PAGE
        ? pageSize
        : 1;
  return {
    x: event.deltaX * deltaScale,
    y: event.deltaY * deltaScale,
  };
}

export function pdfiumScrollSnapshotCanConsumeDelta(snapshot: PdfiumScrollSnapshot, delta: number) {
  if (Math.abs(delta) < SCROLL_EDGE_EPSILON) return false;

  const maxScrollOffset = Math.max(0, snapshot.scrollSize - snapshot.clientSize);
  if (maxScrollOffset <= SCROLL_EDGE_EPSILON) return false;
  return delta < 0
    ? snapshot.scrollOffset > SCROLL_EDGE_EPSILON
    : snapshot.scrollOffset < maxScrollOffset - SCROLL_EDGE_EPSILON;
}

export function firstVisiblePdfPageWidth(
  pageMetrics: Record<number, { top: number; width: number }>,
) {
  const firstPage = Object.values(pageMetrics).toSorted((left, right) => left.top - right.top)[0];
  const width = firstPage?.width ?? 0;
  return Number.isFinite(width) && width > 0 ? Math.round(width) : 0;
}

export function pdfiumPageIndexFromTarget(target: Element | null) {
  const page = target?.closest<HTMLElement>('[data-pdfium-page-index]');
  if (!page) return null;
  const pageIndex = Number(page.dataset.pdfiumPageIndex);
  return Number.isInteger(pageIndex) ? pageIndex : null;
}

function pdfiumOverflowAllowsScroll(overflow: string) {
  return overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay';
}

function pdfiumElementCanConsumeWheel(element: HTMLElement, delta: PdfiumWheelDelta) {
  const style = window.getComputedStyle(element);
  const canScrollY =
    pdfiumOverflowAllowsScroll(style.overflowY) &&
    pdfiumScrollSnapshotCanConsumeDelta(
      {
        clientSize: element.clientHeight,
        scrollOffset: element.scrollTop,
        scrollSize: element.scrollHeight,
      },
      delta.y,
    );
  const canScrollX =
    pdfiumOverflowAllowsScroll(style.overflowX) &&
    pdfiumScrollSnapshotCanConsumeDelta(
      {
        clientSize: element.clientWidth,
        scrollOffset: element.scrollLeft,
        scrollSize: element.scrollWidth,
      },
      delta.x,
    );
  return canScrollY || canScrollX;
}

export function pdfiumRailWheelHasLocalScrollTarget(
  target: Element | null,
  rail: HTMLElement,
  delta: PdfiumWheelDelta,
) {
  let element = target instanceof HTMLElement ? target : (target?.parentElement ?? null);
  while (element && element !== rail) {
    if (pdfiumElementCanConsumeWheel(element, delta)) return true;
    element = element.parentElement;
  }
  return false;
}

export function pdfiumHighlightHitAtClientPoint({
  boxes,
  canvasRect,
  clientX,
  clientY,
  preferredAnnotationIds = [],
}: {
  boxes: HighlightBox[];
  canvasRect: Pick<DOMRect, 'left' | 'top'>;
  clientX: number;
  clientY: number;
  preferredAnnotationIds?: string[];
}) {
  const point = {
    x: clientX - canvasRect.left,
    y: clientY - canvasRect.top,
  };
  return {
    annotationIds:
      preferredAnnotationIds.length > 0
        ? preferredAnnotationIds
        : annotationIdsAtHighlightPoint(boxes, point, 1),
    point,
  };
}

export function pdfiumHighlightChoicePosition(canvasWidth: number, point: PdfiumCanvasPoint) {
  return {
    x: Math.max(8, Math.min(Math.max(8, canvasWidth - 236), point.x + 8)),
    y: Math.max(8, point.y + 8),
  };
}

export function pdfiumSelectionPointFromClientPoint({
  canvasRect,
  clientX,
  clientY,
  geometry,
  metric,
  pageHeight,
  pageTextLength,
  pageWidth,
}: {
  canvasRect: Pick<DOMRect, 'left' | 'top'>;
  clientX: number;
  clientY: number;
  geometry: PdfPageGeometry;
  metric: PageMetric;
  pageHeight: number;
  pageTextLength: number;
  pageWidth: number;
}): PdfiumSelectionPoint | null {
  const canvasX = clientX - canvasRect.left;
  const canvasY = clientY - canvasRect.top;
  if (
    canvasX < metric.left ||
    canvasX > metric.left + metric.width ||
    canvasY < metric.top ||
    canvasY > metric.top + metric.height
  ) {
    return null;
  }

  const pageX = ((canvasX - metric.left) / metric.width) * pageWidth;
  const pageY = ((canvasY - metric.top) / metric.height) * pageHeight;
  const sourceOffset = pdfiumSelectionOffsetAtPagePoint(geometry, pageX, pageY, pageTextLength);
  return sourceOffset === null ? null : { sourceOffset };
}

export function pdfiumSelectionAnchorForOffsets({
  endOffset,
  geometry,
  pageHeight,
  pageIndex,
  pageText,
  pageWidth,
  startOffset,
}: {
  endOffset: number;
  geometry: PdfPageGeometry;
  pageHeight: number;
  pageIndex: number;
  pageText: string;
  pageWidth: number;
  startOffset: number;
}) {
  const rects = pdfiumRectsForTextRange(geometry, startOffset, endOffset, pageWidth, pageHeight);
  if (rects.length === 0) return null;
  return createPdfTextAnchor({
    pageText,
    pageIndex,
    start: startOffset,
    end: endOffset,
    pageWidth,
    pageHeight,
    rects,
  });
}

export function pageMetricIntersectsBox(
  metric: PageMetric,
  box: Pick<HighlightBox, 'left' | 'top' | 'width' | 'height'>,
) {
  return (
    box.left + box.width >= metric.clipLeft &&
    box.left <= metric.clipRight &&
    box.top + box.height >= metric.clipTop &&
    box.top <= metric.clipBottom
  );
}

export function pdfiumRectsForTextRange(
  geometry: PdfPageGeometry,
  start: number,
  end: number,
  pageWidth: number,
  pageHeight: number,
): PdfRect[] {
  const rects: PdfRect[] = [];
  for (const run of geometry.runs) {
    const runStart = run.charStart;
    const runEnd = runStart + run.glyphs.length;
    if (runEnd <= start || runStart >= end) continue;

    let left = Infinity;
    let top = Infinity;
    let right = -Infinity;
    let bottom = -Infinity;
    for (let index = Math.max(start, runStart); index < Math.min(end, runEnd); index += 1) {
      const glyph = run.glyphs[index - runStart];
      if (!glyph || glyph.flags === 2) continue;
      left = Math.min(left, glyph.x);
      top = Math.min(top, glyph.y);
      right = Math.max(right, glyph.x + glyph.width);
      bottom = Math.max(bottom, glyph.y + glyph.height);
    }
    if (left === Infinity) continue;
    rects.push({
      x: clampRatio(left / pageWidth),
      y: clampRatio(top / pageHeight),
      width: clampRatio((right - left) / pageWidth),
      height: clampRatio((bottom - top) / pageHeight),
    });
  }
  return rects;
}

function pdfiumSelectionOffsetAtPagePoint(
  geometry: PdfPageGeometry,
  pageX: number,
  pageY: number,
  pageTextLength: number,
) {
  let best: { offset: number; score: number } | null = null;

  for (const run of geometry.runs) {
    const runStart = run.charStart;
    for (let index = 0; index < run.glyphs.length; index += 1) {
      const glyph = run.glyphs[index];
      if (!glyph || glyph.flags === 2) continue;

      const charIndex = runStart + index;
      if (charIndex < 0 || charIndex > pageTextLength) continue;

      const centerX = glyph.x + glyph.width / 2;
      const centerY = glyph.y + glyph.height / 2;
      const offset = pageX <= centerX ? charIndex : charIndex + 1;
      const score =
        pdfiumSelectionPointRectDistance(pageX, pageY, glyph) * 1_000_000 +
        Math.hypot(pageX - centerX, pageY - centerY);

      if (!best || score < best.score) {
        best = {
          offset: Math.max(0, Math.min(offset, pageTextLength)),
          score,
        };
      }
    }
  }

  return best?.offset ?? null;
}

function pdfiumSelectionPointRectDistance(
  x: number,
  y: number,
  rect: { height: number; width: number; x: number; y: number },
) {
  const dx = x < rect.x ? rect.x - x : x > rect.x + rect.width ? x - (rect.x + rect.width) : 0;
  const dy = y < rect.y ? rect.y - y : y > rect.y + rect.height ? y - (rect.y + rect.height) : 0;
  return dx * dx + dy * dy;
}

export function samePageMetrics(
  left: Record<number, PageMetric>,
  right: Record<number, PageMetric>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return rightKeys.every((key) => {
    const index = Number(key);
    const leftMetric = left[index];
    const rightMetric = right[index];
    return (
      !!leftMetric &&
      !!rightMetric &&
      Math.abs(leftMetric.left - rightMetric.left) < 0.5 &&
      Math.abs(leftMetric.top - rightMetric.top) < 0.5 &&
      Math.abs(leftMetric.width - rightMetric.width) < 0.5 &&
      Math.abs(leftMetric.height - rightMetric.height) < 0.5 &&
      Math.abs(leftMetric.clipLeft - rightMetric.clipLeft) < 0.5 &&
      Math.abs(leftMetric.clipTop - rightMetric.clipTop) < 0.5 &&
      Math.abs(leftMetric.clipRight - rightMetric.clipRight) < 0.5 &&
      Math.abs(leftMetric.clipBottom - rightMetric.clipBottom) < 0.5
    );
  });
}

export function rectToPdfRect(
  rect: { origin: { x: number; y: number }; size: { width: number; height: number } },
  pageWidth: number,
  pageHeight: number,
): PdfRect {
  return {
    x: clampRatio(rect.origin.x / pageWidth),
    y: clampRatio(rect.origin.y / pageHeight),
    width: clampRatio(rect.size.width / pageWidth),
    height: clampRatio(rect.size.height / pageHeight),
  };
}

export function clampRatio(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
