// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageGeometry } from '@embedpdf/models';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  pdfiumRectsForTextRange,
  pdfiumSelectionAnchorForOffsets,
} from '../source/pdfium/pdfium-geometry';

describe('pdfium geometry', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
