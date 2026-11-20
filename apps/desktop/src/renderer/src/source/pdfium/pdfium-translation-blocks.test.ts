import { describe, expect, it } from 'vitest';
import type { PdfPageGeometry } from '@embedpdf/models';
import { buildPdfTextDocument } from './pdfium-text-document';
import {
  pdfPageHasTranslatableText,
  pdfPageTranslationBlocks,
  pdfTranslationBlockBounds,
  pdfTranslationBlocks,
} from './pdfium-translation-blocks';

const singleColumn = ['第一段正文。\n\n第二段正文。'];

describe('pdfTranslationBlocks', () => {
  it('splits a single-column page on blank lines with exact text offsets', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(singleColumn));

    expect(blocks.map((block) => block.text)).toEqual(['第一段正文。', '第二段正文。']);
    expect(blocks.map((block) => block.order)).toEqual([0, 1]);
    expect(singleColumn[0].slice(blocks[0].startOffset, blocks[0].endOffset)).toBe('第一段正文。');
    expect(singleColumn[0].slice(blocks[1].startOffset, blocks[1].endOffset)).toBe('第二段正文。');
  });

  it('changes only the ids of pages whose text changed', () => {
    const before = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页。']));
    const after = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页改动。']));

    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[1]?.id).not.toBe(before[1]?.id);
  });

  it('separates paragraphs with extra spacing while retaining normally wrapped lines', () => {
    const lines = ['First', 'wrapped', 'Second', 'wrapped'];
    const text = lines.join('\r\n');
    let charStart = 0;
    const runs = lines.map((line, index) => {
      const rect = { x: 0, y: [0, 14, 34, 48][index], width: 8, height: 16 };
      const glyph = { ...rect, flags: 0 };
      const run = { charStart, rect, glyphs: Array.from({ length: line.length }, () => glyph) };
      charStart += line.length + 2;
      return run;
    });
    expect(pdfPageTranslationBlocks(0, text, 0, { runs }).map((block) => block.text)).toEqual([
      'First wrapped',
      'Second wrapped',
    ]);
  });

  it('detects scanned or empty PDF pages with no translatable text layer', () => {
    expect(pdfPageHasTranslatableText('')).toBe(false);
    expect(pdfPageHasTranslatableText('   \n\n  \t  ')).toBe(false);
    expect(pdfPageHasTranslatableText('a')).toBe(false);
    expect(pdfPageHasTranslatableText('Hello world paragraph.')).toBe(true);
  });

  it('computes normalized page bounding rect from PDFium glyph geometry', () => {
    const geometry: PdfPageGeometry = {
      runs: [
        {
          charStart: 0,
          glyphs: [
            { x: 50, y: 100, width: 20, height: 12, flags: 0 },
            { x: 70, y: 100, width: 20, height: 12, flags: 0 },
            { x: 90, y: 100, width: 20, height: 12, flags: 0 },
            { x: 110, y: 100, width: 20, height: 12, flags: 0 },
            { x: 130, y: 100, width: 20, height: 12, flags: 0 },
          ],
          rect: { x: 50, y: 100, width: 100, height: 12 },
        },
        {
          charStart: 7,
          glyphs: [
            { x: 50, y: 200, width: 25, height: 14, flags: 0 },
            { x: 75, y: 200, width: 25, height: 14, flags: 0 },
            { x: 100, y: 200, width: 25, height: 14, flags: 0 },
            { x: 125, y: 200, width: 25, height: 14, flags: 0 },
            { x: 150, y: 200, width: 25, height: 14, flags: 0 },
          ],
          rect: { x: 50, y: 200, width: 125, height: 14 },
        },
      ],
    };

    const blocks = pdfPageTranslationBlocks(0, 'Hello\r\nWorld', 0, geometry);
    expect(blocks.map(({ text }) => text)).toEqual(['Hello', 'World']);
    const firstBounds = pdfTranslationBlockBounds(geometry, blocks[0], 500, 1000);
    const secondBounds = pdfTranslationBlockBounds(geometry, blocks[1], 500, 1000);

    expect(firstBounds?.x).toBeCloseTo(0.1);
    expect(firstBounds?.y).toBeCloseTo(0.1);
    expect(firstBounds?.width).toBeCloseTo(0.2);
    expect(firstBounds?.height).toBeCloseTo(0.012);
    expect(secondBounds?.x).toBeCloseTo(0.1);
    expect(secondBounds?.y).toBeCloseTo(0.2);
    expect(secondBounds?.width).toBeCloseTo(0.25);
    expect(secondBounds?.height).toBeCloseTo(0.014);
  });
});
