import { describe, expect, it } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import type { SelectionAdjustmentPointer } from '@yomitomo/reader-ui/reader-app-view';
import {
  canAdjustWebSelectionAnchor,
  describeSelectionAdjustmentPoint,
  webSelectionAdjustmentDraggingHandle,
  webSelectionAdjustmentKind,
  type WebSelectionAdjustment,
} from '../source/web/web-selection-adjustment';

function anchor(overrides: Partial<Annotation['anchor']> = {}): Annotation['anchor'] {
  return {
    exact: 'text',
    prefix: '',
    suffix: '',
    start: 2,
    end: 6,
    ...overrides,
  } as Annotation['anchor'];
}

describe('web selection adjustment', () => {
  it('classifies source and translation anchors', () => {
    expect(webSelectionAdjustmentKind(anchor())).toBe('source');
    expect(webSelectionAdjustmentKind(anchor({ segmentId: 'block-1' }))).toBe('translation');
  });

  it('does not adjust pdf text anchors', () => {
    const pdfAnchor = anchor({
      kind: 'pdf-text',
      pageIndex: 0,
      pageWidth: 800,
      pageHeight: 1000,
      rects: [],
    } as Partial<Annotation['anchor']>);

    expect(webSelectionAdjustmentKind(pdfAnchor)).toBeNull();
    expect(canAdjustWebSelectionAnchor(pdfAnchor)).toBe(false);
  });

  it('does not adjust non-finite or collapsed offsets', () => {
    expect(canAdjustWebSelectionAnchor(anchor({ start: Number.NaN }))).toBe(false);
    expect(canAdjustWebSelectionAnchor(anchor({ end: Number.POSITIVE_INFINITY }))).toBe(false);
    expect(canAdjustWebSelectionAnchor(anchor({ start: 4, end: 4 }))).toBe(false);
  });

  it('switches the dragging handle after crossing the fixed edge', () => {
    const startAdjustment: WebSelectionAdjustment = {
      kind: 'source',
      handle: 'start',
      startOffset: 10,
      endOffset: 30,
    };
    const endAdjustment: WebSelectionAdjustment = {
      kind: 'translation',
      handle: 'end',
      startOffset: 10,
      endOffset: 30,
      translationBlockId: 'block-1',
    };

    expect(webSelectionAdjustmentDraggingHandle(startAdjustment, 18)).toBe('start');
    expect(webSelectionAdjustmentDraggingHandle(startAdjustment, 42)).toBe('end');
    expect(webSelectionAdjustmentDraggingHandle(endAdjustment, 18)).toBe('end');
    expect(webSelectionAdjustmentDraggingHandle(endAdjustment, 4)).toBe('start');
  });

  it('rounds client coordinates when describing adjustment points', () => {
    const point = {
      clientX: 12.4,
      clientY: 56.6,
      handle: 'start',
    } as SelectionAdjustmentPointer;

    expect(describeSelectionAdjustmentPoint(point)).toEqual({
      clientX: 12,
      clientY: 57,
    });
  });
});
