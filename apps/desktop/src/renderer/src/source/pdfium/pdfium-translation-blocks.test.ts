import { describe, expect, it } from 'vitest';
import { buildPdfTextDocument } from './pdfium-text-document';
import { pdfTranslationBlockPage, pdfTranslationBlocks } from './pdfium-translation-blocks';

// Each fixture is the text layer PDFium hands us for one document shape, which is the
// only thing a translation adapter can build on.
const singleColumn = ['第一段正文。\n\n第二段正文。'];
const twoColumn = ['左栏第一句。 右栏第一句。\n\n左栏第二句。 右栏第二句。'];
const paragraphAcrossPages = ['段落开始，在本页结束前被截断', '并在下一页继续。'];
const listAndHeading = ['第一章\n\n- 第一项\n- 第二项\n\n结尾说明。'];
const emptyPage = ['', '本页有正文。'];

describe('pdfTranslationBlocks', () => {
  it('splits a single-column page on blank lines', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(singleColumn));

    expect(blocks.map((block) => block.text)).toEqual(['第一段正文。', '第二段正文。']);
    expect(blocks.map((block) => block.order)).toEqual([0, 1]);
  });

  it('reproduces identical ids for the same document', () => {
    const first = pdfTranslationBlocks(buildPdfTextDocument(singleColumn));
    const second = pdfTranslationBlocks(buildPdfTextDocument(singleColumn));

    expect(second.map((block) => block.id)).toEqual(first.map((block) => block.id));
  });

  it('changes only the ids of pages whose text changed', () => {
    const before = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页。']));
    const after = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页改动。']));

    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[1]?.id).not.toBe(before[1]?.id);
  });

  it('keeps blocks page-scoped so a block can be located for retry', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(paragraphAcrossPages));

    expect(blocks.map((block) => block.pageIndex)).toEqual([0, 1]);
    expect(blocks.map((block) => pdfTranslationBlockPage(block.id))).toEqual([0, 1]);
  });

  it('does not rejoin a paragraph split across pages', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(paragraphAcrossPages));

    // The text layer gives no signal that these belong together, so the first release
    // must translate them as two blocks rather than guess.
    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.text).toBe('段落开始，在本页结束前被截断');
  });

  it('treats a heading and its list items as separate blocks', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(listAndHeading));

    expect(blocks.map((block) => block.text)).toEqual([
      '第一章',
      '- 第一项 - 第二项',
      '结尾说明。',
    ]);
  });

  it('produces no blocks for a page without text', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(emptyPage));

    expect(blocks.map((block) => block.pageIndex)).toEqual([1]);
  });

  it('interleaves two-column text the way the text layer ordered it', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(twoColumn));

    // Documented limitation: column order is whatever PDFium emitted, so a multi-column
    // page can produce blocks that mix both columns in one line.
    expect(blocks[0]?.text).toBe('左栏第一句。 右栏第一句。');
  });
});
