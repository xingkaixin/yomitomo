// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  ebookSelectionRangeFromOffsets,
  ebookSelectionRangeOffsets,
} from '../source/ebook/ebook-selection-adjustment';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ebook selection adjustment', () => {
  it('keeps selection offsets anchored to source text when translations are present', () => {
    const ebookDoc = document.implementation.createHTMLDocument('ebook');
    ebookDoc.body.innerHTML =
      '<main>Alpha <span data-reader-translation>阿尔法</span><strong>beta</strong></main>';
    const root = ebookDoc.querySelector('main');
    const translatedText = ebookDoc.querySelector('[data-reader-translation]')?.firstChild;
    if (!(root instanceof HTMLElement) || !translatedText) throw new Error('missing test nodes');

    const sourceRange = ebookSelectionRangeFromOffsets(root, 6, 10);
    expect(sourceRange?.toString()).toBe('beta');
    expect(sourceRange ? ebookSelectionRangeOffsets(root, sourceRange) : null).toEqual({
      startOffset: 6,
      endOffset: 10,
    });

    const translatedRange = ebookDoc.createRange();
    translatedRange.selectNodeContents(translatedText);
    expect(ebookSelectionRangeOffsets(root, translatedRange)).toBeNull();
  });
});
