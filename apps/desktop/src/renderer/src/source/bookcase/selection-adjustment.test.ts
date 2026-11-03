import { describe, expect, it } from 'vitest';
import { selectionAdjustmentAdjustedOffsets } from './selection-adjustment';

describe('selection adjustment', () => {
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
});
