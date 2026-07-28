import { hashText } from '@yomitomo/shared';
import type { PdfTextDocument } from './pdfium-text-document';

export type PdfTranslationBlock = {
  id: string;
  pageIndex: number;
  order: number;
  text: string;
};

// A PDF text layer has no semantic paragraphs, so blocks come from blank-line grouping
// within a page. Ids stay page-scoped and content-derived: re-opening the same document
// reproduces them, while an edited page produces new ones and invalidates its translation.
const MIN_TRANSLATION_BLOCK_CHARS = 2;

export function pdfTranslationBlocks(document: PdfTextDocument): PdfTranslationBlock[] {
  const blocks: PdfTranslationBlock[] = [];
  for (const page of document.pages) {
    for (const [index, text] of pageBlockTexts(page.pageText).entries()) {
      blocks.push({
        id: pdfTranslationBlockId(page.pageIndex, index, text),
        pageIndex: page.pageIndex,
        order: blocks.length,
        text,
      });
    }
  }
  return blocks;
}

export function pdfTranslationBlockId(pageIndex: number, blockIndex: number, text: string) {
  return `pdf-p${pageIndex}-b${blockIndex}-${hashText(text)}`;
}

export function pdfTranslationBlockPage(blockId: string) {
  const pageIndex = Number(blockId.match(/^pdf-p(\d+)-/)?.[1]);
  return Number.isInteger(pageIndex) ? pageIndex : null;
}

function pageBlockTexts(pageText: string) {
  return pageText
    .split(/\n\s*\n/)
    .map((block) => block.replaceAll(/\s+/g, ' ').trim())
    .filter((block) => block.length >= MIN_TRANSLATION_BLOCK_CHARS);
}
