// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  shouldPreferWebSelectionGestureRange,
  shouldUseWebSelectionGesturePreview,
  webSelectionGestureAdjustedOffsets,
  webTranslationSelectionGesturePointFromClientPoint,
} from '../source/web/web-reader-selection-gesture';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: undefined,
  });
});

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

  it('adjusts the start handle while keeping the end fixed', () => {
    expect(
      webSelectionGestureAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 18,
      }),
    ).toEqual({ startOffset: 18, endOffset: 30 });
  });

  it('adjusts the end handle while keeping the start fixed', () => {
    expect(
      webSelectionGestureAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'end',
        sourceOffset: 24,
      }),
    ).toEqual({ startOffset: 10, endOffset: 24 });
  });

  it('normalizes offsets when a handle crosses the opposite edge', () => {
    expect(
      webSelectionGestureAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 42,
      }),
    ).toEqual({ startOffset: 30, endOffset: 42 });

    expect(
      webSelectionGestureAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'end',
        sourceOffset: 4,
      }),
    ).toEqual({ startOffset: 4, endOffset: 10 });
  });

  it('ignores collapsed handle adjustments', () => {
    expect(
      webSelectionGestureAdjustedOffsets({
        startOffset: 10,
        endOffset: 30,
        handle: 'start',
        sourceOffset: 30,
      }),
    ).toBeNull();
  });

  it('maps translation handle points to translation-local offsets', () => {
    const article = document.createElement('article');
    article.innerHTML =
      '<p>Source</p><div data-reader-translation="true" data-reader-translation-block-id="block-1">译文内容</div>';
    document.body.append(article);

    const translation = article.querySelector<HTMLElement>('[data-reader-translation]');
    const textNode = translation?.firstChild;
    expect(translation).toBeTruthy();
    expect(textNode).toBeTruthy();
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({ offsetNode: textNode as Text, offset: 2 })),
    });

    const point = webTranslationSelectionGesturePointFromClientPoint(article, 'block-1', 10, 20);

    expect(point?.clientX).toBe(10);
    expect(point?.clientY).toBe(20);
    expect(point?.translationBlockId).toBe('block-1');
    expect(point?.translationElement).toBe(translation);
    expect(point?.translationOffset).toBe(2);
  });

  it('rejects translation handle points outside the active translation block', () => {
    const article = document.createElement('article');
    article.innerHTML =
      '<div data-reader-translation="true" data-reader-translation-block-id="block-1">第一段译文</div><div data-reader-translation="true" data-reader-translation-block-id="block-2">第二段译文</div>';
    document.body.append(article);

    const secondTranslation = article.querySelectorAll<HTMLElement>('[data-reader-translation]')[1];
    const textNode = secondTranslation?.firstChild;
    expect(textNode).toBeTruthy();
    Object.defineProperty(document, 'caretPositionFromPoint', {
      configurable: true,
      value: vi.fn(() => ({ offsetNode: textNode as Text, offset: 2 })),
    });

    expect(
      webTranslationSelectionGesturePointFromClientPoint(article, 'block-1', 10, 20),
    ).toBeNull();
  });
});
