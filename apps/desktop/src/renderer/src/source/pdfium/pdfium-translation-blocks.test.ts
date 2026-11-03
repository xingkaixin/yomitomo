import { describe, expect, it } from 'vitest';
import { buildPdfTextDocument } from './pdfium-text-document';
import { pdfTranslationBlocks } from './pdfium-translation-blocks';

const singleColumn = ['第一段正文。\n\n第二段正文。'];

describe('pdfTranslationBlocks', () => {
  it('splits a single-column page on blank lines', () => {
    const blocks = pdfTranslationBlocks(buildPdfTextDocument(singleColumn));

    expect(blocks.map((block) => block.text)).toEqual(['第一段正文。', '第二段正文。']);
    expect(blocks.map((block) => block.order)).toEqual([0, 1]);
  });

  it('changes only the ids of pages whose text changed', () => {
    const before = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页。']));
    const after = pdfTranslationBlocks(buildPdfTextDocument(['第一页。', '第二页改动。']));

    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[1]?.id).not.toBe(before[1]?.id);
  });
});
