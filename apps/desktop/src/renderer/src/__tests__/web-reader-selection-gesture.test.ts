import { describe, expect, it } from 'vitest';
import { shouldPreferWebSelectionGestureRange } from '../source/web/web-reader-selection-gesture';

describe('web reader selection gesture', () => {
  it('keeps native selections when the native range starts at the pointer down offset', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
        gestureStartOffset: 4790,
        nativeStart: 4788,
        nativeEnd: 4966,
        pointerStart: 4790,
        pointerEnd: 4966,
      }),
    ).toBe(false);
  });

  it('rebuilds selections when the native range expands far before the pointer down offset', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
        gestureStartOffset: 4790,
        nativeStart: 0,
        nativeEnd: 4966,
        pointerStart: 4790,
        pointerEnd: 4966,
      }),
    ).toBe(true);
  });

  it('keeps large deliberate selections when the pointer range is similarly large', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
        gestureStartOffset: 4790,
        nativeStart: 0,
        nativeEnd: 4966,
        pointerStart: 0,
        pointerEnd: 4966,
      }),
    ).toBe(false);
  });
});
