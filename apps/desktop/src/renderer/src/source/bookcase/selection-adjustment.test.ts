import { describe, expect, it } from 'vitest';
import type { SelectionAdjustmentPointer } from '@yomitomo/reader-ui/reader-app-view';
import {
  describeSelectionAdjustmentPoint,
  isAdjustableSelectionOffsetRange,
  selectionAdjustmentAdjustedOffsets,
  selectionAdjustmentDraggingHandle,
  type SelectionAdjustmentBounds,
} from './selection-adjustment';

describe('selection adjustment', () => {
  it('rejects non-finite and collapsed offset ranges', () => {
    expect(isAdjustableSelectionOffsetRange(2, 6)).toBe(true);
    expect(isAdjustableSelectionOffsetRange(Number.NaN, 6)).toBe(false);
    expect(isAdjustableSelectionOffsetRange(2, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isAdjustableSelectionOffsetRange(4, 4)).toBe(false);
  });

  it('adjusts the start handle while keeping the end fixed', () => {
    expect(
      selectionAdjustmentAdjustedOffsets(
        {
          startOffset: 10,
          endOffset: 30,
          handle: 'start',
        },
        18,
      ),
    ).toEqual({ startOffset: 18, endOffset: 30 });
  });

  it('adjusts the end handle while keeping the start fixed', () => {
    expect(
      selectionAdjustmentAdjustedOffsets(
        {
          startOffset: 10,
          endOffset: 30,
          handle: 'end',
        },
        24,
      ),
    ).toEqual({ startOffset: 10, endOffset: 24 });
  });

  it('normalizes offsets when a handle crosses the opposite edge', () => {
    expect(
      selectionAdjustmentAdjustedOffsets(
        {
          startOffset: 10,
          endOffset: 30,
          handle: 'start',
        },
        42,
      ),
    ).toEqual({ startOffset: 30, endOffset: 42 });

    expect(
      selectionAdjustmentAdjustedOffsets(
        {
          startOffset: 10,
          endOffset: 30,
          handle: 'end',
        },
        4,
      ),
    ).toEqual({ startOffset: 4, endOffset: 10 });
  });

  it('ignores collapsed handle adjustments', () => {
    expect(
      selectionAdjustmentAdjustedOffsets(
        {
          startOffset: 10,
          endOffset: 30,
          handle: 'start',
        },
        30,
      ),
    ).toBeNull();
  });

  it('switches the dragging handle after crossing the fixed edge', () => {
    const startAdjustment: SelectionAdjustmentBounds = {
      handle: 'start',
      startOffset: 10,
      endOffset: 30,
    };
    const endAdjustment: SelectionAdjustmentBounds = {
      handle: 'end',
      startOffset: 10,
      endOffset: 30,
    };

    expect(selectionAdjustmentDraggingHandle(startAdjustment, 18)).toBe('start');
    expect(selectionAdjustmentDraggingHandle(startAdjustment, 42)).toBe('end');
    expect(selectionAdjustmentDraggingHandle(endAdjustment, 18)).toBe('end');
    expect(selectionAdjustmentDraggingHandle(endAdjustment, 4)).toBe('start');
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
