import { describe, expect, it } from 'vitest';
import type { Annotation } from '@yomitomo/shared';
import {
  canAdjustWebSelectionAnchor,
  webSelectionAdjustmentKind,
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
});
