// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildEpubBookIndex, createEpubTextAnchorFromQuote, epubIndexText } from '@yomitomo/core';
import {
  rangeForEbookAnchorInDocument,
  selectionContextForRange,
  selectionTextForRange,
} from '../source/ebook/ebook-text-anchor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ebook text anchor', () => {
  it('serializes cross-paragraph selections with a searchable text boundary', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML =
      '<p>第一段目标。</p><div data-reader-translation>Translated text.</div><p>第二段目标。</p>';
    const first = doc.querySelectorAll('p')[0].firstChild!;
    const second = doc.querySelectorAll('p')[1].firstChild!;
    const range = doc.createRange();
    range.setStart(first, 2);
    range.setEnd(second, 3);

    expect(selectionTextForRange(range)).toBe('段目标。 第二段');
  });

  it('resolves ebook anchors across foliate block boundaries', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML =
      '<p>第一段目标。</p><div data-reader-translation>Translated text.</div><p>第二段目标。</p>';
    const first = doc.querySelectorAll('p')[0].firstChild!;
    const second = doc.querySelectorAll('p')[1].firstChild!;

    const range = rangeForEbookAnchorInDocument(doc, {
      exact: '段目标。\n\n第二段',
      prefix: '第一',
      suffix: '目标',
      start: 2,
      end: 10,
    });

    expect(range?.startContainer).toBe(first);
    expect(range?.endContainer).toBe(second);
  });

  it('restores repeated quotes at the occurrence that matches their context', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<p>I saw the cat today. You fed the cat yesterday.</p>';
    const textNode = doc.querySelector('p')!.firstChild!;

    const range = rangeForEbookAnchorInDocument(doc, {
      exact: 'the cat',
      prefix: 'I saw the cat today. You fed ',
      suffix: ' yesterday.',
      start: 29,
      end: 36,
    });

    expect(range?.startContainer).toBe(textNode);
    expect(range?.startOffset).toBe(textNode.textContent!.lastIndexOf('the cat'));
  });

  it('anchors selections across line breaks that have no surrounding whitespace', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<p>前文。</p><p>第一行<br>第二行</p>';
    const chapters = [
      {
        id: 'chapter-1',
        title: '第一章',
        paragraphs: Array.from(doc.querySelectorAll('p'), (p) => p.textContent || ''),
      },
    ];
    const line = doc.querySelectorAll('p')[1];
    const range = doc.createRange();
    range.setStart(line.firstChild!, 1);
    range.setEnd(line.lastChild!, 2);

    const anchor = createEpubTextAnchorFromQuote(
      buildEpubBookIndex({ articleId: 'article-1', chapters }),
      epubIndexText(chapters),
      selectionTextForRange(range),
      { chapterId: 'chapter-1', ...selectionContextForRange(doc, range) },
    );

    expect(anchor?.exact).toBe('一行第二');
    expect(anchor && rangeForEbookAnchorInDocument(doc, anchor)?.toString()).toBe('一行第二');
  });
});
