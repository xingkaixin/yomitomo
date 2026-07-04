// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  ebookSelectionPointFromDocumentPoint,
  ebookSelectionRangeFromOffsets,
  ebookSelectionRangeOffsets,
} from '../source/ebook/ebook-selection-adjustment';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ebook selection adjustment', () => {
  it('rebuilds ranges inside the ebook document that owns the text nodes', () => {
    const ebookDoc = document.implementation.createHTMLDocument('ebook');
    ebookDoc.body.innerHTML = '<main>Alpha <strong>beta</strong> gamma</main>';
    const root = ebookDoc.querySelector('main');
    if (!(root instanceof HTMLElement)) throw new Error('missing root');

    const range = ebookSelectionRangeFromOffsets(root, 6, 10);

    expect(range?.toString()).toBe('beta');
    expect(range?.startContainer.ownerDocument).toBe(ebookDoc);
    expect(range ? ebookSelectionRangeOffsets(root, range) : null).toEqual({
      startOffset: 6,
      endOffset: 10,
    });
  });

  it('maps a child document caret position to a document text offset', () => {
    const ebookDoc = document.implementation.createHTMLDocument('ebook');
    ebookDoc.body.innerHTML = '<main>Alpha <strong>beta</strong></main>';
    const text = ebookDoc.querySelector('strong')?.firstChild;
    if (!text) throw new Error('missing text node');

    Object.defineProperty(ebookDoc, 'caretPositionFromPoint', {
      configurable: true,
      value: () => ({ offsetNode: text, offset: 2 }),
    });

    expect(ebookSelectionPointFromDocumentPoint(ebookDoc, 12, 16)).toEqual({
      sourceOffset: 8,
    });
  });
});
