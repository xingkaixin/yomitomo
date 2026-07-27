// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageGeometry } from '@embedpdf/models';
import type { HighlightBox } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  firstVisiblePdfPageWidth,
  pdfiumHighlightChoicePosition,
  pdfiumHighlightHitAtClientPoint,
  pdfiumPageIndexFromTarget,
  pdfiumRailWheelHasLocalScrollTarget,
  pdfiumRectsForTextRange,
  pdfiumScrollSnapshotCanConsumeDelta,
  pdfiumSelectionAnchorForOffsets,
  pdfiumSelectionPointFromClientPoint,
  pdfiumWheelDeltaPixels,
} from '../source/pdfium/pdfium-geometry';

describe('pdfium geometry', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
});

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
