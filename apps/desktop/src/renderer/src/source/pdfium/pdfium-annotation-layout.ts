import {
  createPdfTextAnchor,
  isPdfTextAnchor,
  type Annotation,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationAuthorName,
  selectionActionPosition,
  type HighlightBox,
} from '@yomitomo/core';
import type { AnnotationRailLayout } from '@yomitomo/reader-ui/reader-annotations';
import type { SelectionAction } from '@yomitomo/reader-ui/reader-app-view';
import { pageMetricIntersectsBox, type PageMetric } from './pdfium-geometry';

export type PdfAnnotationNavigationState = {
  currentIndex: number;
  previousId: string | null;
  nextId: string | null;
  totalCount: number;
};

export function pdfiumAnnotationAgentName(annotation: Annotation) {
  return annotationAuthorName(annotation.author);
}

const PDF_ANNOTATION_RAIL_GAP = 20;
const PDF_ANNOTATION_RAIL_MIN_WIDTH = 220;
const PDF_ANNOTATION_RAIL_MAX_WIDTH = 420;
const PDF_ANNOTATION_RAIL_EDGE_INSET = 24;
const PDF_ANNOTATION_RAIL_STACK_OUTSET = 56;

export function pdfiumAnnotationRailLayout(
  pageMetrics: Record<number, PageMetric>,
  canvas: HTMLDivElement | null,
  viewportHeight: number,
  viewportWidth?: number,
  layoutPageWidth?: number,
): AnnotationRailLayout | undefined {
  const canvasWidth = viewportWidth ?? canvas?.getBoundingClientRect().width ?? 0;
  if (canvasWidth <= 0) return undefined;

  const pageMetric = Object.values(pageMetrics).toSorted((left, right) => left.top - right.top)[0];
  if (!pageMetric) return undefined;

  const gap = PDF_ANNOTATION_RAIL_GAP;
  const minimumRailWidth = PDF_ANNOTATION_RAIL_MIN_WIDTH;
  const maximumRailWidth = PDF_ANNOTATION_RAIL_MAX_WIDTH;
  const railOuterGuard = PDF_ANNOTATION_RAIL_EDGE_INSET + PDF_ANNOTATION_RAIL_STACK_OUTSET;
  const pageWidth = Math.min(canvasWidth, Math.round(layoutPageWidth ?? pageMetric.width));
  const sideSpace = minimumRailWidth + gap + railOuterGuard;
  if (canvasWidth < pageWidth + sideSpace) {
    const articleLeft = Math.max(0, Math.round(pageMetric.left));
    const articleRight = Math.min(canvasWidth, Math.round(pageMetric.left + pageMetric.width));
    return {
      articleCenterX: Math.round((articleLeft + articleRight) / 2),
      leftRailLeft: 0,
      mode: 'stacked',
      railWidth: 0,
      rightRailLeft: Math.round(articleRight + gap),
      viewportHeight,
    };
  }

  const hasTwoSidedRails = canvasWidth >= pageWidth + sideSpace * 2;
  const articleLeft = hasTwoSidedRails ? Math.round((canvasWidth - pageWidth) / 2) : 0;
  const articleRight = articleLeft + pageWidth;
  const leftSpace = articleLeft;
  const rightSpace = Math.max(0, canvasWidth - articleRight);
  const mode = hasTwoSidedRails ? 'both' : 'right';
  const usableSpace = hasTwoSidedRails ? Math.min(leftSpace, rightSpace) : rightSpace;
  const railWidth = Math.min(
    maximumRailWidth,
    Math.max(minimumRailWidth, usableSpace - gap - railOuterGuard),
  );
  return {
    articleCenterX: Math.round((articleLeft + articleRight) / 2),
    leftRailLeft: mode === 'right' ? 0 : Math.round(articleLeft - gap - railWidth),
    mode,
    railWidth: Math.round(railWidth),
    rightRailLeft: Math.round(articleRight + gap),
    viewportHeight,
  };
}

const PDF_AUTO_ZOOM_MAX_SCALE = 2;
const PDF_AUTO_ZOOM_MIN_SCALE = 0.5;

// 预留单侧批注栏空间后按宽度优先算初始缩放：页宽 = viewport 宽 − 单侧预留，随窗口放大/缩小。
// 上限 2.0 仅兜底极端超宽屏（避免页面被放得过大）、下限 0.5 兜底极窄窗口。
// both/right/stacked 的模式过渡交给 pdfiumAnnotationRailLayout 依据剩余空间自动决定，
// 这里只负责让页宽填充「viewport − 批注栏预留」、始终给批注栏留出至少单栏空间。
export function computeAutoPdfZoom(input: {
  viewportWidth: number;
  baseWidth: number;
}): number | null {
  const { viewportWidth, baseWidth } = input;
  if (viewportWidth <= 0 || baseWidth <= 0) return null;
  const reservedSideSpace =
    PDF_ANNOTATION_RAIL_MIN_WIDTH +
    PDF_ANNOTATION_RAIL_GAP +
    PDF_ANNOTATION_RAIL_EDGE_INSET +
    PDF_ANNOTATION_RAIL_STACK_OUTSET;
  const widthFirst = (viewportWidth - reservedSideSpace) / baseWidth;
  return Math.min(PDF_AUTO_ZOOM_MAX_SCALE, Math.max(PDF_AUTO_ZOOM_MIN_SCALE, widthFirst));
}

export function pdfiumAnnotationBoxes(
  annotations: Annotation[],
  pageMetrics: Record<number, PageMetric>,
  userProfile: UserProfile,
  agents: PublicAgent[],
): HighlightBox[] {
  return annotations.flatMap((annotation) => {
    if (!isPdfTextAnchor(annotation.anchor)) return [];
    const metric = pageMetrics[annotation.anchor.pageIndex];
    if (!metric) return [];
    return annotation.anchor.rects.flatMap((rect, index) => {
      const box = {
        id: `${annotation.id}-${index}`,
        annotationId: annotation.id,
        contributorId:
          annotation.author.kind === 'agent'
            ? annotation.author.agentId
            : annotation.author.userId || userProfile.id,
        color: annotationColor(annotation, userProfile, agents),
        top: metric.top + rect.y * metric.height,
        left: metric.left + rect.x * metric.width,
        width: Math.max(1, rect.width * metric.width),
        height: Math.max(2, rect.height * metric.height),
      };
      return pageMetricIntersectsBox(metric, box) ? [box] : [];
    });
  });
}

export function pdfiumAnnotationTheaterBoxes(
  annotation: Annotation,
  pageMetrics: Record<number, PageMetric>,
): HighlightBox[] {
  if (!isPdfTextAnchor(annotation.anchor)) return [];
  const metric = pageMetrics[annotation.anchor.pageIndex];
  if (!metric) return [];
  return annotation.anchor.rects.flatMap((rect, index) => {
    const box = {
      id: `theater-${annotation.id}-${index}`,
      annotationId: annotation.id,
      contributorId:
        annotation.author.kind === 'agent'
          ? annotation.author.agentId
          : annotation.author.userId || annotation.id,
      color: annotation.color,
      top: metric.top + rect.y * metric.height,
      left: metric.left + rect.x * metric.width,
      width: Math.max(1, rect.width * metric.width),
      height: Math.max(2, rect.height * metric.height),
    };
    return pageMetricIntersectsBox(metric, box) ? [box] : [];
  });
}

export function pdfiumAnnotationIsVisible(
  annotationId: string | null,
  annotations: Annotation[],
  metrics: Record<number, PageMetric>,
) {
  if (!annotationId) return false;
  const annotation = annotations.find((item) => item.id === annotationId);
  return Boolean(
    annotation && isPdfTextAnchor(annotation.anchor) && metrics[annotation.anchor.pageIndex],
  );
}

export function pdfiumAnnotationNavigationState(
  annotations: Annotation[],
  activeId: string | null,
  currentPage: number,
): PdfAnnotationNavigationState {
  const ordered = pdfiumNavigableAnnotations(annotations);
  if (ordered.length === 0) {
    return { currentIndex: 0, previousId: null, nextId: null, totalCount: 0 };
  }

  const activeIndex = activeId ? ordered.findIndex((annotation) => annotation.id === activeId) : -1;
  if (activeIndex >= 0) {
    return {
      currentIndex: activeIndex + 1,
      previousId: ordered[activeIndex - 1]?.id ?? null,
      nextId: ordered[activeIndex + 1]?.id ?? null,
      totalCount: ordered.length,
    };
  }

  const currentPageIndex = Math.max(0, currentPage - 1);
  const insertionIndex = ordered.findIndex((annotation) => {
    if (!isPdfTextAnchor(annotation.anchor)) return false;
    return annotation.anchor.pageIndex >= currentPageIndex;
  });
  const boundedIndex = insertionIndex >= 0 ? insertionIndex : ordered.length;
  return {
    currentIndex: Math.min(ordered.length, boundedIndex + 1),
    previousId: ordered[boundedIndex - 1]?.id ?? null,
    nextId: ordered[boundedIndex]?.id ?? null,
    totalCount: ordered.length,
  };
}

export function pdfiumVisibleAnnotations(annotations: Annotation[], boxes: HighlightBox[]) {
  const visibleIds = new Set(boxes.map((box) => box.annotationId));
  return annotations.filter((annotation) => visibleIds.has(annotation.id));
}

export function pdfiumNavigableAnnotations(annotations: Annotation[]) {
  return annotations
    .filter((annotation) => isPdfTextAnchor(annotation.anchor))
    .toSorted((left, right) => {
      if (!isPdfTextAnchor(left.anchor) || !isPdfTextAnchor(right.anchor)) return 0;
      return (
        left.anchor.pageIndex - right.anchor.pageIndex ||
        left.anchor.start - right.anchor.start ||
        left.createdAt.localeCompare(right.createdAt)
      );
    });
}

export function pdfiumAnchorReadingPosition(
  anchor: Annotation['anchor'],
  pageMetrics: Record<number, PageMetric>,
  step: number,
): { x: number; y: number } | null {
  if (!isPdfTextAnchor(anchor)) return null;
  const metric = pageMetrics[anchor.pageIndex];
  if (!metric) return null;
  const boxes = anchor.rects.flatMap((rect) => {
    const box = {
      top: metric.top + rect.y * metric.height,
      left: metric.left + rect.x * metric.width,
      width: Math.max(1, rect.width * metric.width),
      height: Math.max(2, rect.height * metric.height),
    };
    return pageMetricIntersectsBox(metric, box) ? [box] : [];
  });
  const totalWidth = boxes.reduce((sum, box) => sum + box.width, 0);
  if (totalWidth <= 0) return null;

  let offset = step % totalWidth;
  for (const box of boxes) {
    if (offset <= box.width) {
      return {
        x: box.left + offset,
        y: box.top + box.height / 2,
      };
    }
    offset -= box.width;
  }
  const lastBox = boxes[boxes.length - 1];
  return lastBox
    ? {
        x: lastBox.left + lastBox.width,
        y: lastBox.top + lastBox.height / 2,
      }
    : null;
}

export function pdfiumTemporaryBoxes(
  anchor: ReturnType<typeof createPdfTextAnchor>,
  metric: PageMetric,
  contributorId: string,
): HighlightBox[] {
  return anchor.rects.flatMap((rect, index) => {
    const box = {
      id: `pdfium-selection-${index}`,
      annotationId: 'pdfium-selection',
      contributorId,
      color: 'rgb(77 155 114)',
      top: metric.top + rect.y * metric.height,
      left: metric.left + rect.x * metric.width,
      width: Math.max(1, rect.width * metric.width),
      height: Math.max(2, rect.height * metric.height),
    };
    return pageMetricIntersectsBox(metric, box) ? [box] : [];
  });
}

export function pdfiumPendingSelectionPresentation(
  action: SelectionAction,
  metric: PageMetric | undefined,
  canvasRect: DOMRect,
  contributorId: string,
) {
  if (!isPdfTextAnchor(action.anchor) || !metric) return null;
  const boxes = pdfiumTemporaryBoxes(action.anchor, metric, contributorId);
  const lastBox = boxes.at(-1);
  if (!lastBox) return null;

  const lastDomRect = new DOMRect(
    canvasRect.left + lastBox.left,
    canvasRect.top + lastBox.top,
    lastBox.width,
    lastBox.height,
  );
  return {
    action: {
      ...action,
      ...selectionActionPosition(lastDomRect, canvasRect),
    },
    boxes,
  };
}
