// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  rangeForEbookAnchorInDocument,
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
});
