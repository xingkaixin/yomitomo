import type { PdfPageGeometry } from '@embedpdf/models';
import { hashText, type PdfRect } from '@yomitomo/shared';
import { clampRatio, pdfiumRectsForTextRange } from './pdfium-geometry';
import type { PdfTextDocument } from './pdfium-text-document';

export type PdfTranslationBlock = {
  id: string;
  pageIndex: number;
  order: number;
  text: string;
  startOffset: number;
  endOffset: number;
};

const MIN_TRANSLATION_BLOCK_CHARS = 2;

export function pdfPageTranslationSourceId(pageIndex: number) {
  return `pdf-page-${pageIndex}`;
}

export function pdfPageTranslationBlocks(
  pageIndex: number,
  pageText: string,
  orderOffset = 0,
  geometry?: PdfPageGeometry,
): PdfTranslationBlock[] {
  const blocks: PdfTranslationBlock[] = [];
  for (const [index, span] of pageBlockSpans(pageText, geometry).entries()) {
    blocks.push({
      id: pdfTranslationBlockId(pageIndex, index, span.text),
      pageIndex,
      order: orderOffset + blocks.length,
      text: span.text,
      startOffset: span.startOffset,
      endOffset: span.endOffset,
    });
  }
  return blocks;
}

export function pdfTranslationBlocks(document: PdfTextDocument): PdfTranslationBlock[] {
  const blocks: PdfTranslationBlock[] = [];
  for (const page of document.pages) {
    blocks.push(...pdfPageTranslationBlocks(page.pageIndex, page.pageText, blocks.length));
  }
  return blocks;
}

export function pdfPageHasTranslatableText(pageText: string) {
  return pdfPageTranslationBlocks(0, pageText).length > 0;
}

export function pdfTranslationBlockId(pageIndex: number, blockIndex: number, text: string) {
  return `pdf-p${pageIndex}-b${blockIndex}-${hashText(text)}`;
}

export function pdfTranslationBlockBounds(
  geometry: PdfPageGeometry,
  block: Pick<PdfTranslationBlock, 'startOffset' | 'endOffset'>,
  pageWidth: number,
  pageHeight: number,
): PdfRect | null {
  if (pageWidth <= 0 || pageHeight <= 0 || block.endOffset <= block.startOffset) return null;
  const rects = pdfiumRectsForTextRange(
    geometry,
    block.startOffset,
    block.endOffset,
    pageWidth,
    pageHeight,
  );
  if (rects.length === 0) return null;

  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    x: clampRatio(left),
    y: clampRatio(top),
    width: clampRatio(right - left),
    height: clampRatio(bottom - top),
  };
}

function pageBlockSpans(pageText: string, geometry?: PdfPageGeometry) {
  const spans: Array<{ text: string; startOffset: number; endOffset: number }> = [];
  const breaks = new Set<number>();
  for (const match of pageText.matchAll(/\n\s*\n/g)) breaks.add(match.index + match[0].length);
  const lineGaps: { offset: number; relativeGap: number }[] = [];
  let previous: { end: number; y: number; fontSize: number } | undefined;
  for (const run of geometry?.runs ?? []) {
    for (const [index, glyph] of run.glyphs.entries()) {
      const offset = run.charStart + index;
      if (glyph.flags === 2 || !pageText[offset]?.trim() || glyph.height <= 0) continue;
      const fontSize = run.fontSize || glyph.height;
      if (previous && glyph.y > previous.y && /[\r\n]/.test(pageText.slice(previous.end, offset))) {
        const sizeRatio =
          Math.max(previous.fontSize, fontSize) / Math.min(previous.fontSize, fontSize);
        if (sizeRatio >= 1.3) breaks.add(offset);
        else lineGaps.push({ offset, relativeGap: (glyph.y - previous.y) / fontSize });
      }
      previous = { end: offset + 1, y: glyph.y, fontSize };
    }
  }
  // PDFium uses one newline for both wraps and paragraphs. Estimate the ordinary leading
  // from similarly sized lines; transitions to headings do not measure body line spacing.
  const gaps = lineGaps.map((line) => line.relativeGap).toSorted((a, b) => a - b);
  const ordinaryGap = gaps[Math.floor((gaps.length - 1) / 4)] ?? 1;
  const paragraphGap = Math.min(1.75, ordinaryGap * 1.3);
  for (const { offset, relativeGap } of lineGaps) {
    if (relativeGap > paragraphGap) breaks.add(offset);
  }
  let cursor = 0;

  const pushSlice = (rawStart: number, rawEnd: number) => {
    const raw = pageText.slice(rawStart, rawEnd);
    const leadingWhitespace = raw.length - raw.trimStart().length;
    const trailingWhitespace = raw.length - raw.trimEnd().length;
    const startOffset = rawStart + leadingWhitespace;
    const endOffset = rawEnd - trailingWhitespace;
    if (endOffset <= startOffset) return;
    const normalized = pageText.slice(startOffset, endOffset).replaceAll(/\s+/g, ' ').trim();
    if (normalized.length < MIN_TRANSLATION_BLOCK_CHARS) return;
    spans.push({ text: normalized, startOffset, endOffset });
  };

  for (const offset of [...breaks].toSorted((a, b) => a - b)) {
    pushSlice(cursor, offset);
    cursor = offset;
  }
  pushSlice(cursor, pageText.length);
  return spans;
}
