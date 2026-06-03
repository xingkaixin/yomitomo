import type { PdfBookmarkObject, PdfPageGeometry } from '@embedpdf/models';
import {
  createPdfTextAnchor,
  createTextAnchor,
  isPdfTextAnchor,
  resolveTextAnchor,
  type AgentReadingPlanItem,
  type Annotation,
  type ArticleReadingProgress,
  type ArticleRecord,
  type PdfRect,
  type PdfTextAnchor,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import {
  annotationColor,
  annotationHasPublishedDistillation,
  type HighlightBox,
  type TocItem,
} from '@yomitomo/core';
import type { AnnotationRailLayout } from '@yomitomo/reader-ui/reader-annotations';
import type { PromptArticle } from '../../shell/app-reading-types';
import type { SourceAgentAnnotationRequestOptions } from '../bookcase/app-source-agent-request';
import { promptArticle } from '../bookcase/app-source-bookcase-shared';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

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

export type PdfPageTextIndex = {
  pageIndex: number;
  pageText: string;
  textStart: number;
  textEnd: number;
  bodyStart: number;
  bodyEnd: number;
};

export type PdfTextDocument = {
  text: string;
  pages: PdfPageTextIndex[];
};

export type PdfPageGeometryEntry = {
  geometry: PdfPageGeometry;
  width: number;
  height: number;
};

export type PdfAnnotationNavigationState = {
  previousId: string | null;
  nextId: string | null;
};

export function pdfiumAnnotationAgentName(annotation: Annotation) {
  return annotation.agentNickname || annotation.agentUsername || '助手';
}

export function pdfiumAnnotationRailLayout(
  pageMetrics: Record<number, PageMetric>,
  canvas: HTMLDivElement | null,
  viewportHeight: number,
): AnnotationRailLayout | undefined {
  const canvasWidth = canvas?.getBoundingClientRect().width ?? 0;
  if (canvasWidth <= 0) return undefined;

  const pageMetric = Object.values(pageMetrics).toSorted((left, right) => left.top - right.top)[0];
  if (!pageMetric) return undefined;

  const gap = 20;
  const minimumRailWidth = 220;
  const maximumRailWidth = 420;
  const articleLeft = Math.max(0, Math.round(pageMetric.left));
  const articleRight = Math.min(canvasWidth, Math.round(pageMetric.left + pageMetric.width));
  const leftSpace = articleLeft;
  const rightSpace = Math.max(0, Math.round(canvasWidth - articleRight));
  const leftAvailable = leftSpace >= minimumRailWidth + gap;
  const rightAvailable = rightSpace >= minimumRailWidth + gap;

  if (!leftAvailable && !rightAvailable) {
    return {
      articleCenterX: Math.round((articleLeft + articleRight) / 2),
      leftRailLeft: 0,
      mode: 'stacked',
      railWidth: 0,
      rightRailLeft: Math.round(articleRight + gap),
      viewportHeight,
    };
  }

  const mode = leftAvailable && rightAvailable ? 'both' : leftAvailable ? 'left' : 'right';
  const usableSpace =
    mode === 'both' ? Math.min(leftSpace, rightSpace) : mode === 'left' ? leftSpace : rightSpace;
  const railWidth = Math.min(maximumRailWidth, Math.max(minimumRailWidth, usableSpace - gap));
  return {
    articleCenterX: Math.round((articleLeft + articleRight) / 2),
    leftRailLeft: Math.round(articleLeft - gap - railWidth),
    mode,
    railWidth: Math.round(railWidth),
    rightRailLeft: Math.round(articleRight + gap),
    viewportHeight,
  };
}

export function pdfiumPromptArticle(
  article: ArticleRecord,
  anchor: Annotation['anchor'] | undefined,
  pageText: string,
): PromptArticle {
  const articleContext = promptArticle(article, pageText);
  const pageLabel = anchor && isPdfTextAnchor(anchor) ? `第 ${anchor.pageIndex + 1} 页\n` : '';
  return {
    ...articleContext,
    text: `${pageLabel}${pageText}`,
  };
}

export function normalizeInitialPageIndex(article: PdfArticleRecord) {
  return clampPageIndex(article.readingProgress?.pageIndex ?? 0, article.pdf.metadata.pageCount);
}

export function clampPageIndex(pageIndex: number, pageCount: number) {
  if (!Number.isFinite(pageIndex)) return 0;
  return Math.max(0, Math.min(Math.max(0, pageCount - 1), Math.trunc(pageIndex)));
}

export function pageProgress(pageIndex: number, pageCount: number) {
  if (pageCount <= 1) return 1;
  return pageIndex / (pageCount - 1);
}

export function pdfPageProgressPercent(pageNumber: number, pageCount: number) {
  return Number(
    (pageProgress(clampPageIndex(pageNumber - 1, pageCount), pageCount) * 100).toFixed(2),
  );
}

export function pdfReadingProgress(pageIndex: number, pageCount: number): ArticleReadingProgress {
  return {
    pageIndex,
    pageCount,
    progress: pageProgress(pageIndex, pageCount),
    updatedAt: new Date().toISOString(),
  };
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
        contributorId: annotation.agentId || annotation.userId || userProfile.id,
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
      contributorId: annotation.agentId || annotation.userId || annotation.id,
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
  if (ordered.length === 0) return { previousId: null, nextId: null };

  const activeIndex = activeId ? ordered.findIndex((annotation) => annotation.id === activeId) : -1;
  if (activeIndex >= 0) {
    return {
      previousId: ordered[activeIndex - 1]?.id ?? null,
      nextId: ordered[activeIndex + 1]?.id ?? null,
    };
  }

  const currentPageIndex = Math.max(0, currentPage - 1);
  const insertionIndex = ordered.findIndex((annotation) => {
    if (!isPdfTextAnchor(annotation.anchor)) return false;
    return annotation.anchor.pageIndex >= currentPageIndex;
  });
  const boundedIndex = insertionIndex >= 0 ? insertionIndex : ordered.length;
  return {
    previousId: ordered[boundedIndex - 1]?.id ?? null,
    nextId: ordered[boundedIndex]?.id ?? null,
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
  return anchor.rects.map((rect, index) => ({
    id: `pdfium-selection-${index}`,
    annotationId: 'pdfium-selection',
    contributorId,
    color: 'rgb(77 155 114)',
    top: metric.top + rect.y * metric.height,
    left: metric.left + rect.x * metric.width,
    width: Math.max(1, rect.width * metric.width),
    height: Math.max(2, rect.height * metric.height),
  }));
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

export function buildPdfTextDocument(pageTexts: string[]): PdfTextDocument {
  let text = '';
  const pages: PdfPageTextIndex[] = [];
  pageTexts.forEach((pageText, pageIndex) => {
    if (pageIndex > 0) text += '\n\n';
    const header = `第 ${pageIndex + 1} 页\n`;
    const textStart = text.length;
    text += header;
    const bodyStart = text.length;
    text += pageText;
    const bodyEnd = text.length;
    pages.push({
      pageIndex,
      pageText,
      textStart,
      textEnd: text.length,
      bodyStart,
      bodyEnd,
    });
  });
  return { text, pages };
}

export function pdfReaderReadingSections(
  textDocument: PdfTextDocument,
  tocItems: TocItem[],
  pageCount: number,
) {
  const tocSections = pdfReaderBookmarkRanges(textDocument, tocItems).flatMap((range) =>
    pdfReadingSectionForTextRange(
      textDocument,
      range.start,
      range.end,
      `pdf-bookmark-${range.pageIndex + 1}-${range.localStart}-${range.item.index}`,
      range.item.text,
    ),
  );
  if (tocSections.length > 0) return tocSections;

  const pageGroupSize = 5;
  const sections = [];
  for (let startPage = 0; startPage < pageCount; startPage += pageGroupSize) {
    const endPage = Math.min(pageCount, startPage + pageGroupSize);
    sections.push(
      ...pdfReadingSectionForPageRange(
        textDocument,
        startPage,
        endPage,
        `pdf-pages-${startPage + 1}-${endPage}`,
        startPage + 1 === endPage ? `第 ${endPage} 页` : `第 ${startPage + 1}-${endPage} 页`,
      ),
    );
  }
  return sections;
}

export function pdfReaderBookmarkRanges(textDocument: PdfTextDocument, tocItems: TocItem[]) {
  const orderedBoundaries = pdfReaderBookmarkBoundaries(textDocument, tocItems);
  return orderedBoundaries.flatMap((boundary, index) => {
    const end = orderedBoundaries[index + 1]?.start ?? textDocument.text.length;
    return end > boundary.start ? [{ ...boundary, end }] : [];
  });
}

export function pdfReaderBookmarkBoundaries(textDocument: PdfTextDocument, tocItems: TocItem[]) {
  const searchStartByPage = new Map<number, number>();
  return tocItems
    .toSorted((left, right) => left.start - right.start || left.index - right.index)
    .flatMap((item) => {
      const page = textDocument.pages[item.start];
      if (!page) return [];
      const searchStart = searchStartByPage.get(page.pageIndex) ?? 0;
      const foundAfterPrevious = page.pageText.indexOf(item.text, searchStart);
      const found = foundAfterPrevious >= 0 ? foundAfterPrevious : page.pageText.indexOf(item.text);
      const localStart = Math.max(
        0,
        Math.min(found >= 0 ? found : searchStart, page.pageText.length),
      );
      searchStartByPage.set(page.pageIndex, localStart + item.text.length);
      return [
        {
          item,
          pageIndex: page.pageIndex,
          localStart,
          start: page.bodyStart + localStart,
        },
      ];
    });
}

export function pdfReadingSectionForTextRange(
  textDocument: PdfTextDocument,
  start: number,
  end: number,
  id: string,
  title: string,
) {
  const safeStart = Math.max(0, Math.min(start, textDocument.text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, textDocument.text.length));
  if (!textDocument.text.slice(safeStart, safeEnd).trim()) return [];
  return [
    {
      id,
      title,
      start: safeStart,
      end: safeEnd,
    },
  ];
}

export function pdfReadingSectionForPageRange(
  textDocument: PdfTextDocument,
  startPage: number,
  endPage: number,
  id: string,
  title: string,
) {
  const pages = textDocument.pages
    .slice(Math.max(0, startPage), Math.min(textDocument.pages.length, endPage))
    .filter((page) => page.pageText.trim());
  const firstPage = pages[0];
  const lastPage = pages[pages.length - 1];
  if (!firstPage || !lastPage || lastPage.bodyEnd <= firstPage.bodyStart) return [];
  return [
    {
      id,
      title,
      start: firstPage.bodyStart,
      end: lastPage.bodyEnd,
    },
  ];
}

export function constrainPdfiumAgentPlanAnnotation(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[] | undefined,
  articleText: string,
) {
  if (!readingPlan?.length) return annotation;

  const scopedAnchor = resolvePdfiumAgentPlanAnchor(annotation, readingPlan, articleText);
  if (!scopedAnchor) return null;
  const { planItem, position } = scopedAnchor;
  const scopedAnnotation = {
    ...annotation,
    anchor: createTextAnchor(articleText, position.start, position.end),
  };
  if (!planItem) return null;
  if (!planItem.readingIntent) return scopedAnnotation;
  if (annotation.readingIntent === planItem.readingIntent) return scopedAnnotation;

  return {
    ...scopedAnnotation,
    readingIntent: planItem.readingIntent,
    comments: annotation.comments.map((comment) => ({
      ...comment,
      readingIntent: comment.readingIntent || planItem.readingIntent,
    })),
  };
}

export function resolvePdfiumAgentPlanAnchor(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[],
  articleText: string,
) {
  const orderedPlan = readingPlan.toSorted((left, right) => left.sectionStart - right.sectionStart);
  for (const planItem of orderedPlan) {
    const sectionText = articleText.slice(planItem.sectionStart, planItem.sectionEnd);
    const localRange = resolvePdfiumAnchorInSection(annotation.anchor, sectionText, planItem);
    if (!localRange) continue;
    return {
      planItem,
      position: {
        start: planItem.sectionStart + localRange.start,
        end: planItem.sectionStart + localRange.end,
      },
    };
  }
  return null;
}

export function resolvePdfiumAnchorInSection(
  anchor: Annotation['anchor'],
  sectionText: string,
  planItem: AgentReadingPlanItem,
) {
  const candidates = [anchor.start - planItem.sectionStart, anchor.start, 0];
  for (const start of candidates) {
    const safeStart = Math.max(0, Math.min(start, Math.max(0, sectionText.length - 1)));
    const safeEnd = Math.max(
      safeStart,
      Math.min(safeStart + anchor.exact.length, sectionText.length),
    );
    const resolved = resolveTextAnchor(sectionText, {
      ...anchor,
      start: safeStart,
      end: safeEnd,
    });
    if (resolved) return resolved;
  }
  return null;
}

export function pdfiumAnchorForReadingPlanStart(
  readingPlan: AgentReadingPlanItem[],
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
) {
  const firstItem = readingPlan.toSorted(
    (left, right) => left.sectionStart - right.sectionStart,
  )[0];
  if (!firstItem) return undefined;
  const page = textDocument.pages.find(
    (item) => item.bodyStart <= firstItem.sectionStart && item.bodyEnd > firstItem.sectionStart,
  );
  if (!page) return undefined;
  const geometryEntry = pageGeometryByIndex.get(page.pageIndex);
  if (!geometryEntry) return undefined;
  const range = pdfiumReadingPlanStartRange(firstItem, page);
  const rects = pdfiumRectsForTextRange(
    geometryEntry.geometry,
    range.start,
    range.end,
    geometryEntry.width,
    geometryEntry.height,
  );
  return createPdfTextAnchor({
    pageText: page.pageText,
    pageIndex: page.pageIndex,
    start: range.start,
    end: range.end,
    pageWidth: geometryEntry.width,
    pageHeight: geometryEntry.height,
    rects,
  });
}

export function pdfiumReadingPlanStartRange(item: AgentReadingPlanItem, page: PdfPageTextIndex) {
  if (page.pageText.length === 0) return { start: 0, end: 0 };
  const sectionStart = Math.max(0, item.sectionStart - page.bodyStart);
  const sectionEnd = Math.max(
    sectionStart + 1,
    Math.min(item.sectionEnd - page.bodyStart, page.pageText.length),
  );
  const text = page.pageText.slice(sectionStart, sectionEnd);
  const firstTextOffset = text.search(/\S/);
  const start = Math.min(
    page.pageText.length - 1,
    sectionStart + (firstTextOffset >= 0 ? firstTextOffset : 0),
  );
  const end = Math.min(page.pageText.length, Math.max(start + 1, start + 24));
  return { start, end };
}

export function pdfiumAgentAnnotationRequestOptions(
  options: SourceAgentAnnotationRequestOptions,
): SourceAgentAnnotationRequestOptions {
  return options.readingPlan?.length && !options.targetAnchor
    ? {
        ...options,
        readingPlan: options.readingPlan.toSorted(
          (left, right) => left.sectionStart - right.sectionStart,
        ),
      }
    : options;
}

export function pdfiumMapReadingPlanAgentAnnotation(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[],
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
) {
  const constrainedAnnotation = constrainPdfiumAgentPlanAnnotation(
    annotation,
    readingPlan,
    textDocument.text,
  );
  if (!constrainedAnnotation) return null;
  return pdfiumAnnotationFromGlobalAgentAnnotation(
    constrainedAnnotation,
    textDocument,
    pageGeometryByIndex,
  );
}

export function pdfiumAnnotationFromGlobalAgentAnnotation(
  annotation: Annotation,
  textDocument: PdfTextDocument,
  pageGeometryByIndex: Map<number, PdfPageGeometryEntry>,
): Annotation | null {
  const range = resolveTextAnchor(textDocument.text, annotation.anchor);
  if (!range) return null;
  const page = textDocument.pages.find(
    (item) => range.start >= item.bodyStart && range.end <= item.bodyEnd,
  );
  if (!page) return null;
  const geometryEntry = pageGeometryByIndex.get(page.pageIndex);
  if (!geometryEntry) return null;
  const pageStart = range.start - page.bodyStart;
  const pageEnd = range.end - page.bodyStart;
  const rects = pdfiumRectsForTextRange(
    geometryEntry.geometry,
    pageStart,
    pageEnd,
    geometryEntry.width,
    geometryEntry.height,
  );
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText: page.pageText,
      pageIndex: page.pageIndex,
      start: pageStart,
      end: pageEnd,
      pageWidth: geometryEntry.width,
      pageHeight: geometryEntry.height,
      rects,
    }),
  };
}

export function pdfiumAnnotationFromAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
  pageWidth: number,
  pageHeight: number,
  geometry: PdfPageGeometry,
): Annotation | null {
  const range = pdfiumTextRangeForAgentAnnotation(annotation, pageText, pageIndex);
  if (!range) return null;
  const rects = pdfiumRectsForTextRange(geometry, range.start, range.end, pageWidth, pageHeight);
  if (rects.length === 0) return null;
  return {
    ...annotation,
    anchor: createPdfTextAnchor({
      pageText,
      pageIndex,
      start: range.start,
      end: range.end,
      pageWidth,
      pageHeight,
      rects,
    }),
  };
}

export function pdfiumMapTargetAgentAnnotation({
  annotation,
  geometry,
  pageHeight,
  pageIndex,
  pageText,
  pageWidth,
}: {
  annotation: Annotation;
  geometry: PdfPageGeometry;
  pageHeight: number;
  pageIndex: number;
  pageText: string;
  pageWidth: number;
}) {
  return pdfiumAnnotationFromAgentAnnotation(
    annotation,
    pageText,
    pageIndex,
    pageWidth,
    pageHeight,
    geometry,
  );
}

export function pdfiumTextRangeForAgentAnnotation(
  annotation: Annotation,
  pageText: string,
  pageIndex: number,
) {
  if (isPdfTextAnchor(annotation.anchor)) {
    return annotation.anchor.pageIndex === pageIndex
      ? { start: annotation.anchor.start, end: annotation.anchor.end }
      : null;
  }
  const direct = pageText.slice(annotation.anchor.start, annotation.anchor.end);
  if (direct === annotation.anchor.exact) {
    return { start: annotation.anchor.start, end: annotation.anchor.end };
  }
  const start = pageText.indexOf(annotation.anchor.exact);
  return start >= 0 ? { start, end: start + annotation.anchor.exact.length } : null;
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

export function pdfiumBookmarkTocItems(
  bookmarks: PdfBookmarkObject[],
  pageCount: number,
): TocItem[] {
  const items: TocItem[] = [];

  function visit(bookmarkItems: PdfBookmarkObject[], depth: number) {
    for (const bookmark of bookmarkItems) {
      const title = bookmark.title.trim();
      const pageIndex = pdfiumBookmarkPageIndex(bookmark);
      if (title && pageIndex !== null) {
        items.push({
          index: items.length,
          text: title,
          depth,
          start: pageIndex,
          end: pageCount,
        });
      }
      if (bookmark.children?.length) visit(bookmark.children, depth + 1);
    }
  }

  visit(bookmarks, 0);
  return primaryPdfiumTocItems(items, pageCount);
}

export function primaryPdfiumTocItems(items: TocItem[], pageCount: number): TocItem[] {
  const primaryDepth = Math.min(...items.map((item) => item.depth));
  if (!Number.isFinite(primaryDepth)) return [];
  const primaryItems = items.filter((item) => item.depth === primaryDepth);
  return primaryItems.map((item, index) => {
    const nextPageItem = primaryItems.slice(index + 1).find((next) => next.start > item.start);
    return {
      index,
      text: item.text,
      depth: item.depth,
      start: item.start,
      end: nextPageItem?.start ?? pageCount,
    };
  });
}

export function pdfiumBookmarkPageIndex(bookmark: PdfBookmarkObject): number | null {
  const target = bookmark.target;
  if (!target) return null;
  if (target.type === 'destination') return target.destination.pageIndex;
  if ('destination' in target.action) return target.action.destination.pageIndex;
  return null;
}

export function pdfiumTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
  textDocument: PdfTextDocument | null,
) {
  const drafts = new Map<
    number,
    { count: number; colors: Set<string>; distillationCount: number }
  >();
  for (const item of tocItems) {
    drafts.set(item.index, { count: 0, colors: new Set(), distillationCount: 0 });
  }
  const ranges = textDocument ? pdfReaderBookmarkRanges(textDocument, tocItems) : [];
  for (const annotation of annotations) {
    if (!isPdfTextAnchor(annotation.anchor)) continue;
    const item = textDocument
      ? pdfiumTocItemForTextAnchor(annotation.anchor, textDocument, ranges)
      : pdfiumTocItemForPageAnchor(annotation.anchor, tocItems);
    if (!item) continue;
    const draft = drafts.get(item.index);
    if (!draft) continue;
    draft.count += 1;
    draft.colors.add(annotationColor(annotation, userProfile, agents));
    if (annotationHasPublishedDistillation(annotation)) draft.distillationCount += 1;
  }
  return new Map(
    Array.from(drafts, ([index, draft]) => [
      index,
      {
        count: draft.count,
        colors: Array.from(draft.colors),
        distillationCount: draft.distillationCount,
      },
    ]),
  );
}

export function pdfiumTocItemForTextAnchor(
  anchor: PdfTextAnchor,
  textDocument: PdfTextDocument,
  ranges: ReturnType<typeof pdfReaderBookmarkRanges>,
) {
  const page = textDocument.pages[anchor.pageIndex];
  if (!page) return null;
  const position = page.bodyStart + anchor.start;
  return ranges.find((range) => position >= range.start && position < range.end)?.item ?? null;
}

export function pdfiumTocItemForPageAnchor(anchor: PdfTextAnchor, tocItems: TocItem[]) {
  const candidates = tocItems.filter(
    (item) => anchor.pageIndex >= item.start && anchor.pageIndex < item.end,
  );
  return candidates.toSorted(
    (left, right) =>
      left.end - left.start - (right.end - right.start) ||
      right.depth - left.depth ||
      right.index - left.index,
  )[0];
}
