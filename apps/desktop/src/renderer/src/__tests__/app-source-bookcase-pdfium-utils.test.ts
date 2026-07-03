// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageGeometry } from '@embedpdf/models';
import { createPdfTextAnchor, createTextAnchor, type Annotation } from '@yomitomo/shared';
import type { HighlightBox, TocItem } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  buildPdfTextDocument,
  clampPageIndex,
  computeAutoPdfZoom,
  firstVisiblePdfPageWidth,
  pdfiumAgentAnnotationRequestOptions,
  pdfiumAnnotationRailLayout,
  pdfiumMapReadingPlanAgentAnnotation,
  pdfiumMapTargetAgentAnnotation,
  pdfiumPageIndexFromTarget,
  pdfiumRailWheelHasLocalScrollTarget,
  pdfPageProgressPercent,
  pdfReaderBookmarkRanges,
  pdfReaderReadingSections,
  pdfiumAnnotationNavigationState,
  pdfiumScrollSnapshotCanConsumeDelta,
  pdfiumRectsForTextRange,
  pdfiumSelectionAdjustedOffsets,
  pdfiumSelectionAnchorForOffsets,
  pdfiumSelectionDraggingHandle,
  pdfiumSelectionPointFromClientPoint,
  pdfiumVisibleAnnotations,
  pdfiumWheelDeltaPixels,
  pdfiumHighlightChoicePosition,
  pdfiumHighlightHitAtClientPoint,
  primaryPdfiumTocItems,
} from '../source/pdfium/app-source-bookcase-pdfium-utils';

describe('app-source-bookcase-pdfium-utils', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clamps PDF page indexes and derives slider progress percent', () => {
    expect(clampPageIndex(Number.NaN, 10)).toBe(0);
    expect(clampPageIndex(-4, 10)).toBe(0);
    expect(clampPageIndex(4.8, 10)).toBe(4);
    expect(clampPageIndex(99, 10)).toBe(9);
    expect(clampPageIndex(3, 0)).toBe(0);

    expect(pdfPageProgressPercent(1, 1)).toBe(100);
    expect(pdfPageProgressPercent(1, 5)).toBe(0);
    expect(pdfPageProgressPercent(3, 5)).toBe(50);
    expect(pdfPageProgressPercent(9, 5)).toBe(100);
  });

  it('maps PDF highlight clicks from client coordinates to canvas hits', () => {
    const boxes: HighlightBox[] = [
      {
        annotationId: 'first',
        color: '#f4c95d',
        contributorId: 'user',
        height: 10,
        id: 'first-0',
        left: 20,
        top: 30,
        width: 80,
      },
    ];

    expect(
      pdfiumHighlightHitAtClientPoint({
        boxes,
        canvasRect: { left: 100, top: 200 },
        clientX: 119,
        clientY: 229,
      }),
    ).toEqual({
      annotationIds: ['first'],
      point: { x: 19, y: 29 },
    });

    expect(
      pdfiumHighlightHitAtClientPoint({
        boxes,
        canvasRect: { left: 100, top: 200 },
        clientX: 10,
        clientY: 10,
        preferredAnnotationIds: ['preferred'],
      }).annotationIds,
    ).toEqual(['preferred']);
  });

  it('keeps PDF highlight choice menus inside the reader canvas', () => {
    expect(pdfiumHighlightChoicePosition(500, { x: 480, y: -20 })).toEqual({
      x: 264,
      y: 8,
    });
    expect(pdfiumHighlightChoicePosition(200, { x: -10, y: 40 })).toEqual({
      x: 8,
      y: 48,
    });
  });

  it('normalizes PDF rail wheel deltas to pixels', () => {
    expect(pdfiumWheelDeltaPixels({ deltaMode: 0, deltaX: 3, deltaY: 5 }, 700)).toEqual({
      x: 3,
      y: 5,
    });
    expect(pdfiumWheelDeltaPixels({ deltaMode: 1, deltaX: 2, deltaY: -3 }, 700)).toEqual({
      x: 32,
      y: -48,
    });
    expect(pdfiumWheelDeltaPixels({ deltaMode: 2, deltaX: 0, deltaY: 1 }, 700)).toEqual({
      x: 0,
      y: 700,
    });
  });

  it('detects whether a scroll snapshot can consume wheel delta', () => {
    expect(
      pdfiumScrollSnapshotCanConsumeDelta(
        { clientSize: 400, scrollOffset: 0, scrollSize: 1200 },
        -24,
      ),
    ).toBe(false);
    expect(
      pdfiumScrollSnapshotCanConsumeDelta(
        { clientSize: 400, scrollOffset: 200, scrollSize: 1200 },
        -24,
      ),
    ).toBe(true);
    expect(
      pdfiumScrollSnapshotCanConsumeDelta(
        { clientSize: 400, scrollOffset: 799.5, scrollSize: 1200 },
        24,
      ),
    ).toBe(false);
    expect(
      pdfiumScrollSnapshotCanConsumeDelta(
        { clientSize: 400, scrollOffset: 200, scrollSize: 1200 },
        24,
      ),
    ).toBe(true);
    expect(
      pdfiumScrollSnapshotCanConsumeDelta(
        { clientSize: 400, scrollOffset: 0, scrollSize: 400 },
        24,
      ),
    ).toBe(false);
  });

  it('uses the top-most visible PDF page width', () => {
    expect(
      firstVisiblePdfPageWidth({
        2: { top: 400, width: 612.4 },
        0: { top: 120, width: 498.6 },
        1: { top: -20, width: 300.2 },
      }),
    ).toBe(300);
    expect(firstVisiblePdfPageWidth({})).toBe(0);
    expect(firstVisiblePdfPageWidth({ 0: { top: 0, width: Number.NaN } })).toBe(0);
    expect(firstVisiblePdfPageWidth({ 0: { top: 0, width: -1 } })).toBe(0);
  });

  it('reads the PDF page index from the target page ancestor', () => {
    const page = document.createElement('div');
    const child = document.createElement('button');
    page.dataset.pdfiumPageIndex = '4';
    page.append(child);

    expect(pdfiumPageIndexFromTarget(child)).toBe(4);
    page.dataset.pdfiumPageIndex = '4.5';
    expect(pdfiumPageIndexFromTarget(child)).toBeNull();
    expect(pdfiumPageIndexFromTarget(document.createElement('div'))).toBeNull();
    expect(pdfiumPageIndexFromTarget(null)).toBeNull();
  });

  it('detects local rail wheel targets that can consume scroll', () => {
    const rail = document.createElement('div');
    const scroller = document.createElement('div');
    const target = document.createElement('button');
    scroller.style.overflowY = 'auto';
    scroller.append(target);
    rail.append(scroller);
    document.body.append(rail);
    setScrollMetrics(scroller, {
      clientHeight: 100,
      scrollHeight: 300,
      scrollTop: 50,
    });
    vi.spyOn(window, 'getComputedStyle');

    expect(pdfiumRailWheelHasLocalScrollTarget(target, rail, { x: 0, y: 24 })).toBe(true);
    expect(window.getComputedStyle).toHaveBeenCalledWith(scroller);

    scroller.scrollTop = 0;
    expect(pdfiumRailWheelHasLocalScrollTarget(target, rail, { x: 0, y: -24 })).toBe(false);

    rail.remove();
  });

  it('checks horizontal local rail wheel scrolling with computed overflow', () => {
    const rail = document.createElement('div');
    const scroller = document.createElement('div');
    const target = document.createElement('span');
    scroller.style.overflowX = 'scroll';
    scroller.append(target);
    rail.append(scroller);
    document.body.append(rail);
    setScrollMetrics(scroller, {
      clientWidth: 100,
      scrollLeft: 25,
      scrollWidth: 300,
    });

    expect(pdfiumRailWheelHasLocalScrollTarget(target, rail, { x: -8, y: 0 })).toBe(true);

    scroller.style.overflowX = 'hidden';
    expect(pdfiumRailWheelHasLocalScrollTarget(target, rail, { x: -8, y: 0 })).toBe(false);

    rail.remove();
  });

  it('places PDF annotation rail on the available page side', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 1200 }),
    } as HTMLDivElement;
    const pageMetrics = {
      0: {
        left: 400,
        top: 10,
        width: 400,
        height: 600,
        clipLeft: 0,
        clipTop: 0,
        clipRight: 1000,
        clipBottom: 700,
      },
    };

    expect(pdfiumAnnotationRailLayout(pageMetrics, canvas, 640)).toMatchObject({
      articleCenterX: 600,
      leftRailLeft: 80,
      mode: 'both',
      railWidth: 300,
      rightRailLeft: 820,
      viewportHeight: 640,
    });
  });

  it('reserves PDF rail edge space for stacked card spread', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 1341 }),
    } as HTMLDivElement;
    const pageMetrics = {
      0: {
        left: 422,
        top: 10,
        width: 498,
        height: 704,
        clipLeft: 0,
        clipTop: 0,
        clipRight: 1341,
        clipBottom: 724,
      },
    };

    expect(pdfiumAnnotationRailLayout(pageMetrics, canvas, 724, 1341, 498)).toMatchObject({
      articleCenterX: 671,
      leftRailLeft: 81,
      mode: 'both',
      railWidth: 321,
      rightRailLeft: 940,
      viewportHeight: 724,
    });
  });

  it('left-aligns PDF pages when only a right annotation rail fits', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 860 }),
    } as HTMLDivElement;
    const pageMetrics = {
      0: {
        left: 180,
        top: 10,
        width: 500,
        height: 700,
        clipLeft: 0,
        clipTop: 0,
        clipRight: 760,
        clipBottom: 720,
      },
    };

    expect(pdfiumAnnotationRailLayout(pageMetrics, canvas, 640)).toMatchObject({
      articleCenterX: 250,
      leftRailLeft: 0,
      mode: 'right',
      railWidth: 260,
      rightRailLeft: 520,
      viewportHeight: 640,
    });
  });

  it('uses stable layout page width when deciding PDF rail mode', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 1200 }),
    } as HTMLDivElement;
    const pageMetrics = {
      0: {
        left: 0,
        top: 10,
        width: 760,
        height: 700,
        clipLeft: 0,
        clipTop: 0,
        clipRight: 1000,
        clipBottom: 720,
      },
    };

    expect(pdfiumAnnotationRailLayout(pageMetrics, canvas, 640, 1200, 500)).toMatchObject({
      articleCenterX: 600,
      leftRailLeft: 80,
      mode: 'both',
      railWidth: 250,
      rightRailLeft: 870,
      viewportHeight: 640,
    });
  });

  it('falls back to stacked annotation rail layout when side space is tight', () => {
    const canvas = {
      getBoundingClientRect: () => ({ width: 520 }),
    } as HTMLDivElement;
    const pageMetrics = {
      0: {
        left: 40,
        top: 10,
        width: 450,
        height: 600,
        clipLeft: 0,
        clipTop: 0,
        clipRight: 520,
        clipBottom: 700,
      },
    };

    expect(pdfiumAnnotationRailLayout(pageMetrics, canvas, 640)).toMatchObject({
      articleCenterX: 265,
      mode: 'stacked',
      railWidth: 0,
      viewportHeight: 640,
    });
  });

  it('builds a searchable PDF text document with page offsets', () => {
    const document = buildPdfTextDocument(['第一页正文', '第二页正文']);

    expect(document.text).toBe('第 1 页\n第一页正文\n\n第 2 页\n第二页正文');
    expect(document.pages).toMatchObject([
      {
        pageIndex: 0,
        pageText: '第一页正文',
        textStart: 0,
        bodyStart: 6,
        bodyEnd: 11,
      },
      {
        pageIndex: 1,
        pageText: '第二页正文',
        textStart: 13,
        bodyStart: 19,
        bodyEnd: 24,
      },
    ]);
  });

  it('uses bookmark ranges before falling back to page groups', () => {
    const document = buildPdfTextDocument(['第一章 内容', '第二章 内容']);
    const tocItems: TocItem[] = [
      { index: 0, text: '第一章', depth: 0, start: 0, end: 1 },
      { index: 1, text: '第二章', depth: 0, start: 1, end: 2 },
    ];

    expect(pdfReaderBookmarkRanges(document, tocItems)).toMatchObject([
      {
        item: tocItems[0],
        pageIndex: 0,
        localStart: 0,
        start: document.pages[0].bodyStart,
        end: document.pages[1].bodyStart,
      },
      {
        item: tocItems[1],
        pageIndex: 1,
        localStart: 0,
        start: document.pages[1].bodyStart,
        end: document.text.length,
      },
    ]);
    expect(pdfReaderReadingSections(document, tocItems, 2)).toEqual([
      {
        id: 'pdf-bookmark-1-0-0',
        title: '第一章',
        start: document.pages[0].bodyStart,
        end: document.pages[1].bodyStart,
      },
      {
        id: 'pdf-bookmark-2-0-1',
        title: '第二章',
        start: document.pages[1].bodyStart,
        end: document.text.length,
      },
    ]);
  });

  it('groups non-empty pages when bookmarks are unavailable', () => {
    const document = buildPdfTextDocument(['一', '', '三', '四', '五', '六']);

    expect(pdfReaderReadingSections(document, [], 6)).toEqual([
      {
        id: 'pdf-pages-1-5',
        title: '第 1-5 页',
        start: document.pages[0].bodyStart,
        end: document.pages[4].bodyEnd,
      },
      {
        id: 'pdf-pages-6-6',
        title: '第 6 页',
        start: document.pages[5].bodyStart,
        end: document.pages[5].bodyEnd,
      },
    ]);
  });

  it('keeps only primary depth TOC items and derives page ends', () => {
    const items: TocItem[] = [
      { index: 0, text: '章一', depth: 0, start: 0, end: 9 },
      { index: 1, text: '节一', depth: 1, start: 1, end: 9 },
      { index: 2, text: '章二', depth: 0, start: 4, end: 9 },
    ];

    expect(primaryPdfiumTocItems(items, 9)).toEqual([
      { index: 0, text: '章一', depth: 0, start: 0, end: 4 },
      { index: 1, text: '章二', depth: 0, start: 4, end: 9 },
    ]);
  });

  it('orders PDF annotation navigation by page, offset, and creation time', () => {
    const annotations = [
      pdfAnnotation('late', 1, 2, '2026-05-25T00:00:02.000Z'),
      pdfAnnotation('first', 0, 8, '2026-05-25T00:00:00.000Z'),
      pdfAnnotation('middle', 1, 2, '2026-05-25T00:00:01.000Z'),
      textAnnotation('web'),
    ];

    expect(pdfiumAnnotationNavigationState(annotations, 'middle', 1)).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'late',
      totalCount: 3,
    });
    expect(pdfiumAnnotationNavigationState(annotations, null, 2)).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'middle',
      totalCount: 3,
    });
  });

  it('filters PDF rail annotations to annotations with visible boxes', () => {
    const annotations = [
      pdfAnnotation('visible', 0, 1, '2026-05-25T00:00:00.000Z'),
      pdfAnnotation('offscreen', 3, 1, '2026-05-25T00:00:01.000Z'),
    ];

    expect(
      pdfiumVisibleAnnotations(annotations, [
        {
          id: 'visible-0',
          annotationId: 'visible',
          contributorId: 'user',
          color: 'yellow',
          left: 10,
          top: 10,
          width: 20,
          height: 8,
        },
      ]).map((annotation) => annotation.id),
    ).toEqual(['visible']);
  });

  it('converts visible glyph runs to normalized PDF rects', () => {
    const geometry = {
      runs: [
        {
          charStart: 0,
          glyphs: [
            { x: 10, y: 20, width: 5, height: 10, flags: 0 },
            { x: 15, y: 20, width: 5, height: 10, flags: 0 },
            { x: 20, y: 20, width: 5, height: 10, flags: 2 },
          ],
        },
        {
          charStart: 3,
          glyphs: [{ x: 0, y: 40, width: 10, height: 10, flags: 0 }],
        },
      ],
    } as unknown as PdfPageGeometry;

    expect(pdfiumRectsForTextRange(geometry, 1, 4, 100, 100)).toEqual([
      { x: 0.15, y: 0.2, width: 0.05, height: 0.1 },
      { x: 0, y: 0.4, width: 0.1, height: 0.1 },
    ]);
  });

  it('adjusts PDF selection handle offsets inside a single page', () => {
    expect(
      pdfiumSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 18,
      }),
    ).toEqual({ startOffset: 18, endOffset: 30 });

    expect(
      pdfiumSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'end',
        sourceOffset: 4,
      }),
    ).toEqual({ startOffset: 4, endOffset: 10 });

    expect(
      pdfiumSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 30,
      }),
    ).toBeNull();
  });

  it('switches the PDF selection dragging handle after crossing the fixed edge', () => {
    const adjustment = {
      startOffset: 10,
      endOffset: 30,
      handle: 'start' as const,
    };

    expect(pdfiumSelectionDraggingHandle(adjustment, 18)).toBe('start');
    expect(pdfiumSelectionDraggingHandle(adjustment, 42)).toBe('end');
  });

  it('maps PDF client points to nearest page glyph offsets', () => {
    const geometry = glyphGeometry(4);
    const metric = {
      left: 20,
      top: 30,
      width: 200,
      height: 100,
      clipLeft: 20,
      clipTop: 30,
      clipRight: 220,
      clipBottom: 130,
    };

    expect(
      pdfiumSelectionPointFromClientPoint({
        canvasRect: { left: 100, top: 200 },
        clientX: 100 + 20 + 2,
        clientY: 200 + 30 + 25,
        geometry,
        metric,
        pageWidth: 40,
        pageHeight: 100,
        pageTextLength: 4,
      }),
    ).toEqual({ sourceOffset: 0 });

    expect(
      pdfiumSelectionPointFromClientPoint({
        canvasRect: { left: 100, top: 200 },
        clientX: 100 + 20 + 190,
        clientY: 200 + 30 + 25,
        geometry,
        metric,
        pageWidth: 40,
        pageHeight: 100,
        pageTextLength: 4,
      }),
    ).toEqual({ sourceOffset: 4 });

    expect(
      pdfiumSelectionPointFromClientPoint({
        canvasRect: { left: 100, top: 200 },
        clientX: 90,
        clientY: 190,
        geometry,
        metric,
        pageWidth: 40,
        pageHeight: 100,
        pageTextLength: 4,
      }),
    ).toBeNull();
  });

  it('rebuilds PDF text anchors from adjusted page offsets', () => {
    const anchor = pdfiumSelectionAnchorForOffsets({
      geometry: glyphGeometry(5),
      pageText: 'abcde',
      pageIndex: 2,
      pageWidth: 50,
      pageHeight: 100,
      startOffset: 1,
      endOffset: 4,
    });

    expect(anchor?.exact).toBe('bcd');
    expect(anchor?.pageIndex).toBe(2);
    expect(anchor?.rects).toEqual([{ x: 0.2, y: 0.2, width: 0.6, height: 0.1 }]);
  });

  it('maps reading-plan agent annotations through global PDF text geometry', () => {
    const document = buildPdfTextDocument(['第一页正文', '第二页正文']);
    const firstPage = document.pages[0];
    const secondPage = document.pages[1];
    const unsortedPlan = [
      {
        sectionId: 'second',
        sectionTitle: '第二页',
        sectionStart: secondPage.bodyStart,
        sectionEnd: secondPage.bodyEnd,
        readingIntent: 'challenge' as const,
      },
      {
        sectionId: 'first',
        sectionTitle: '第一页',
        sectionStart: firstPage.bodyStart,
        sectionEnd: firstPage.bodyEnd,
      },
    ];
    const options = pdfiumAgentAnnotationRequestOptions({ readingPlan: unsortedPlan });
    const sourceAnnotation = textAnnotation('agent_plan', {
      anchor: createTextAnchor(document.text, secondPage.bodyStart, secondPage.bodyStart + 2),
      comments: [
        {
          id: 'comment_1',
          author: 'ai',
          content: 'comment',
          createdAt: '2026-05-25T00:00:00.000Z',
        },
      ],
      readingIntent: 'explain',
    });

    const mapped = pdfiumMapReadingPlanAgentAnnotation(
      sourceAnnotation,
      options.readingPlan!,
      document,
      new Map([
        [1, { geometry: glyphGeometry(secondPage.pageText.length), width: 100, height: 100 }],
      ]),
    );

    expect(options.readingPlan?.map((item) => item.sectionId)).toEqual(['first', 'second']);
    expect(mapped?.readingIntent).toBe('challenge');
    expect(mapped?.comments[0]?.readingIntent).toBe('challenge');
    expect(mapped?.anchor).toEqual(
      expect.objectContaining({
        pageIndex: 1,
        start: 0,
        end: 2,
      }),
    );
    expect(mapped).toBeTruthy();
    expect((mapped!.anchor as ReturnType<typeof createPdfTextAnchor>).rects.length).toBeGreaterThan(
      0,
    );
  });

  it('maps target-anchor agent annotations using page-level geometry', () => {
    const pageText = '第一页正文';
    const mapped = pdfiumMapTargetAgentAnnotation({
      annotation: textAnnotation('agent_target', {
        anchor: createTextAnchor(pageText, 1, 3),
      }),
      geometry: glyphGeometry(pageText.length),
      pageHeight: 200,
      pageIndex: 3,
      pageText,
      pageWidth: 100,
    });

    expect(mapped?.anchor).toEqual(
      expect.objectContaining({
        pageIndex: 3,
        start: 1,
        end: 3,
        pageWidth: 100,
        pageHeight: 200,
      }),
    );
    expect(mapped).toBeTruthy();
    expect((mapped!.anchor as ReturnType<typeof createPdfTextAnchor>).rects.length).toBeGreaterThan(
      0,
    );
  });
});

function pdfAnnotation(
  id: string,
  pageIndex: number,
  start: number,
  createdAt: string,
): Annotation {
  return {
    id,
    articleId: 'article',
    anchor: createPdfTextAnchor({
      pageText: '0123456789',
      pageIndex,
      start,
      end: start + 1,
      pageWidth: 100,
      pageHeight: 100,
      rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.1 }],
    }),
    author: 'user',
    comments: [],
    color: 'yellow',
    createdAt,
    updatedAt: createdAt,
  } as Annotation;
}

function textAnnotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    articleId: 'article',
    anchor: createTextAnchor('plain article text', 0, 5),
    author: 'user',
    comments: [],
    color: 'yellow',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  } as Annotation;
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: Partial<
    Pick<
      HTMLElement,
      'clientHeight' | 'clientWidth' | 'scrollHeight' | 'scrollLeft' | 'scrollTop' | 'scrollWidth'
    >
  >,
) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, {
      configurable: true,
      value,
      writable: true,
    });
  }
}

describe('computeAutoPdfZoom', () => {
  // sideSpace = minRail(220) + gap(20) + edgeInset(24) + stackOutset(56) = 320
  it('upscales width-first to fill the viewport minus the reserved rail side', () => {
    // (1180 - 320) / 612 ≈ 1.405 — pages grow past 100% as the window widens
    expect(computeAutoPdfZoom({ viewportWidth: 1180, baseWidth: 612 })).toBeCloseTo(1.405, 3);
  });

  it('caps at the max scale on extreme ultrawide viewports', () => {
    expect(computeAutoPdfZoom({ viewportWidth: 2000, baseWidth: 600 })).toBe(2);
  });

  it('scales down below 1.0 on narrow viewports', () => {
    expect(computeAutoPdfZoom({ viewportWidth: 800, baseWidth: 600 })).toBeCloseTo(0.8, 5);
  });

  it('floors at the hard minimum on narrow viewports', () => {
    expect(computeAutoPdfZoom({ viewportWidth: 500, baseWidth: 600 })).toBe(0.5);
  });

  it('returns null when viewport or page width is not measurable yet', () => {
    expect(computeAutoPdfZoom({ viewportWidth: 0, baseWidth: 600 })).toBeNull();
    expect(computeAutoPdfZoom({ viewportWidth: 800, baseWidth: 0 })).toBeNull();
  });
});

function glyphGeometry(length: number): PdfPageGeometry {
  return {
    runs: [
      {
        charStart: 0,
        glyphs: Array.from({ length }, (_, index) => ({
          x: index * 10,
          y: 20,
          width: 10,
          height: 10,
          flags: 0,
        })),
      },
    ],
  } as unknown as PdfPageGeometry;
}
