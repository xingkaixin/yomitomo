// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { HighlightBox } from '@yomitomo/core';
import {
  annotationRailDebugBoxGroups,
  annotationRailDebugNumber,
  annotationRailDebugRect,
  annotationRailDebugStyleNumber,
  webAnnotationRailDebugEnabled,
  WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS,
  WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN,
  WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT,
  WEB_ANNOTATION_RAIL_DEBUG_STORAGE_KEY,
} from '../source/web/web-annotation-rail-debug';

afterEach(() => {
  delete (window as unknown as { yomitomoWebAnnotationRailDebug?: boolean })
    .yomitomoWebAnnotationRailDebug;
  window.localStorage.clear();
});

function highlightBox(overrides: Partial<HighlightBox>): HighlightBox {
  return {
    annotationId: 'annotation-1',
    color: '#ffd700',
    height: 0,
    id: 'box-1',
    left: 0,
    top: 0,
    width: 0,
    ...overrides,
  };
}

describe('webAnnotationRailDebugEnabled', () => {
  it('enables rail debug from the window flag', () => {
    (
      window as unknown as { yomitomoWebAnnotationRailDebug?: boolean }
    ).yomitomoWebAnnotationRailDebug = true;

    expect(webAnnotationRailDebugEnabled()).toBe(true);
  });

  it("enables rail debug from localStorage '1'", () => {
    window.localStorage.setItem(WEB_ANNOTATION_RAIL_DEBUG_STORAGE_KEY, '1');

    expect(webAnnotationRailDebugEnabled()).toBe(true);
  });

  it('keeps rail debug disabled when flags are absent', () => {
    expect(webAnnotationRailDebugEnabled()).toBe(false);
  });
});

describe('annotationRailDebugNumber', () => {
  it('rounds finite numbers and returns null for missing or non-finite values', () => {
    expect(annotationRailDebugNumber(12.4)).toBe(12);
    expect(annotationRailDebugNumber(12.5)).toBe(13);
    expect(annotationRailDebugNumber(null)).toBeNull();
    expect(annotationRailDebugNumber(undefined)).toBeNull();
    expect(annotationRailDebugNumber(Number.NaN)).toBeNull();
    expect(annotationRailDebugNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('annotationRailDebugRect', () => {
  it('formats rect numbers with rounded values', () => {
    expect(
      annotationRailDebugRect({
        bottom: 40.5,
        height: 30.3,
        left: 10.2,
        right: 60.6,
        top: 9.7,
        width: 50.4,
      } as DOMRectReadOnly),
    ).toEqual({
      bottom: 41,
      height: 30,
      left: 10,
      right: 61,
      top: 10,
      width: 50,
    });
  });

  it('returns null for missing rects', () => {
    expect(annotationRailDebugRect(null)).toBeNull();
  });
});

describe('annotationRailDebugStyleNumber', () => {
  it('parses css number strings and returns null for invalid values', () => {
    expect(annotationRailDebugStyleNumber('12.5px')).toBe(13);
    expect(annotationRailDebugStyleNumber('-4.4px')).toBe(-4);
    expect(annotationRailDebugStyleNumber('auto')).toBeNull();
    expect(annotationRailDebugStyleNumber('')).toBeNull();
  });
});

describe('annotationRailDebugBoxGroups', () => {
  it('groups boxes by annotation id and spans each group bounds', () => {
    const groups = annotationRailDebugBoxGroups([
      highlightBox({ annotationId: 'a', height: 10, id: 'a-1', top: 20 }),
      highlightBox({ annotationId: 'b', height: 5, id: 'b-1', top: 12 }),
      highlightBox({ annotationId: 'a', height: 8, id: 'a-2', top: 5 }),
    ]);

    expect(groups.get('a')).toEqual({ bottom: 30, top: 5 });
    expect(groups.get('b')).toEqual({ bottom: 17, top: 12 });
  });
});

describe('web annotation rail debug constants', () => {
  it('exports the current layout sampling values', () => {
    expect(WEB_ANNOTATION_RAIL_DEBUG_INTERVAL_MS).toBe(80);
    expect(WEB_ANNOTATION_RAIL_DEBUG_OVERSCAN).toBe(96);
    expect(WEB_ANNOTATION_RAIL_DEBUG_SAMPLE_LIMIT).toBe(12);
  });
});
