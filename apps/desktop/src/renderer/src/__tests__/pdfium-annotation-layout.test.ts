// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfTextAnchor, createTextAnchor, type Annotation } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  computeAutoPdfZoom,
  pdfiumAnnotationNavigationState,
  pdfiumAnnotationRailLayout,
  pdfiumPendingSelectionPresentation,
  pdfiumVisibleAnnotations,
} from '../source/pdfium/pdfium-annotation-layout';

describe('pdfium annotation layout', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('repositions a pending PDF selection from current page metrics', () => {
    const anchor = createPdfTextAnchor({
      pageText: 'selected text',
      pageIndex: 0,
      pageWidth: 100,
      pageHeight: 100,
      start: 0,
      end: 8,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.1 }],
    });
    const action = { anchor, adjustable: true, x: 0, y: 0 };
    const canvasRect = new DOMRect(100, 200, 400, 300);
    const metric = {
      left: 20,
      top: 30,
      width: 200,
      height: 100,
      clipLeft: 0,
      clipTop: 0,
      clipRight: 400,
      clipBottom: 300,
    };

    expect(pdfiumPendingSelectionPresentation(action, metric, canvasRect, 'user_1')).toEqual({
      action: {
        ...action,
        x: 122,
        y: 54,
      },
      boxes: [
        {
          id: 'pdfium-selection-0',
          annotationId: 'pdfium-selection',
          contributorId: 'user_1',
          color: 'rgb(77 155 114)',
          top: 50,
          left: 40,
          width: 80,
          height: 10,
        },
      ],
    });
  });

  it('hides a pending PDF selection after its text leaves the viewport', () => {
    const anchor = createPdfTextAnchor({
      pageText: 'selected text',
      pageIndex: 0,
      pageWidth: 100,
      pageHeight: 100,
      start: 0,
      end: 8,
      rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.1 }],
    });
    const action = { anchor, adjustable: true, x: 0, y: 0 };
    const canvasRect = new DOMRect(100, 200, 400, 300);
    const scrolledMetric = {
      left: 20,
      top: -90,
      width: 200,
      height: 100,
      clipLeft: 0,
      clipTop: 0,
      clipRight: 400,
      clipBottom: 300,
    };

    expect(
      pdfiumPendingSelectionPresentation(action, scrolledMetric, canvasRect, 'user_1'),
    ).toBeNull();
    expect(pdfiumPendingSelectionPresentation(action, undefined, canvasRect, 'user_1')).toBeNull();
  });

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
    author: { kind: 'user', username: 'reader' },
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
    author: { kind: 'user', username: 'reader' },
    comments: [],
    color: 'yellow',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  } as Annotation;
}
