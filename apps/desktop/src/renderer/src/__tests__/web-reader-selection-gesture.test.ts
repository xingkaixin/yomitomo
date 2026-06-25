import { describe, expect, it } from 'vitest';
import {
  shouldPreferWebSelectionGestureRange,
  shouldUseWebSelectionGesturePreview,
} from '../source/web/web-reader-selection-gesture';

describe('web reader selection gesture', () => {
  it('uses custom drag previews for source text gestures', () => {
    expect(
      shouldUseWebSelectionGesturePreview({
        clientX: 120,
        clientY: 220,
        sourceOffset: 42,
        translationBlockId: null,
      }),
    ).toBe(true);
  });

  it('keeps native drag selection visible for translation gestures', () => {
    expect(
      shouldUseWebSelectionGesturePreview({
        clientX: 120,
        clientY: 220,
        sourceOffset: 42,
        translationBlockId: 'block_1',
      }),
    ).toBe(false);
  });

  it('does not start custom drag previews without a gesture point', () => {
    expect(shouldUseWebSelectionGesturePreview(null)).toBe(false);
  });

  it('keeps native selections when the native range starts at the pointer down offset', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
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
        nativeStart: 0,
        nativeEnd: 4966,
        pointerStart: 4790,
        pointerEnd: 4966,
      }),
    ).toBe(true);
  });

  it('rebuilds visible selections that drift to the article start while dragging', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
        nativeStart: 13,
        nativeEnd: 156,
        pointerStart: 139,
        pointerEnd: 158,
      }),
    ).toBe(true);
  });

  it('keeps large deliberate selections when the pointer range is similarly large', () => {
    expect(
      shouldPreferWebSelectionGestureRange({
        nativeStart: 0,
        nativeEnd: 4966,
        pointerStart: 0,
        pointerEnd: 4966,
      }),
    ).toBe(false);
  });
});
