// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  ebookSelectionAdjustmentDraggingHandle,
  ebookSelectionAdjustedOffsets,
  ebookSelectionPointFromDocumentPoint,
  ebookSelectionRangeFromOffsets,
  ebookSelectionRangeOffsets,
  type EbookSelectionAdjustment,
} from '../source/ebook/ebook-selection-adjustment';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ebook selection adjustment', () => {
  it('adjusts the start handle while keeping the end fixed', () => {
    expect(
      ebookSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 18,
      }),
    ).toEqual({ startOffset: 18, endOffset: 30 });
  });

  it('normalizes offsets when a handle crosses the opposite edge', () => {
    expect(
      ebookSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 42,
      }),
    ).toEqual({ startOffset: 30, endOffset: 42 });

    expect(
      ebookSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'end',
        sourceOffset: 4,
      }),
    ).toEqual({ startOffset: 4, endOffset: 10 });
  });

  it('ignores collapsed handle adjustments', () => {
    expect(
      ebookSelectionAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 30,
      }),
    ).toBeNull();
  });

  it('switches the active handle after crossing the fixed edge', () => {
    const adjustment: EbookSelectionAdjustment = {
      doc: document,
      startOffset: 10,
      endOffset: 30,
      handle: 'start',
      sectionIndex: 0,
    };

    expect(ebookSelectionAdjustmentDraggingHandle(adjustment, 18)).toBe('start');
    expect(ebookSelectionAdjustmentDraggingHandle(adjustment, 42)).toBe('end');
  });

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
