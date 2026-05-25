import { describe, expect, it } from 'vitest';
import type { HighlightBox } from '@yomitomo/core';
import type { Annotation } from '@yomitomo/shared';
import {
  buildAnnotationRailItems,
  readerAnnotationScrollTop,
} from '@yomitomo/reader-ui/reader-utils';

function box(input: Partial<HighlightBox> & Pick<HighlightBox, 'annotationId'>): HighlightBox {
  return {
    id: input.id || input.annotationId,
    annotationId: input.annotationId,
    color: input.color || '#f4c95d',
    top: input.top ?? 0,
    left: input.left ?? 0,
    width: input.width ?? 100,
    height: input.height ?? 20,
  };
}

function annotation(id: string, start: number, end: number): Annotation {
  return {
    id,
    anchor: {
      exact: id,
      prefix: '',
      suffix: '',
      start,
      end,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}

describe('buildAnnotationRailItems', () => {
  it('positions annotation cards from measured highlight boxes', () => {
    const items = buildAnnotationRailItems(
      [annotation('annotation_1', 0, 10), annotation('annotation_2', 20, 30)],
      [
        box({ annotationId: 'annotation_1', top: 220 }),
        box({ annotationId: 'annotation_2', top: 520 }),
      ],
      null,
    );

    expect(items.map((item) => [item.annotation.id, item.style.top])).toEqual([
      ['annotation_1', 210],
      ['annotation_2', 510],
    ]);
  });

  it('brings the active overlapping annotation to the front of the stack', () => {
    const items = buildAnnotationRailItems(
      [annotation('annotation_1', 0, 20), annotation('annotation_2', 10, 30)],
      [
        box({ annotationId: 'annotation_1', top: 220 }),
        box({ annotationId: 'annotation_2', top: 230 }),
      ],
      'annotation_2',
    );

    const first = items.find((item) => item.annotation.id === 'annotation_1')!;
    const second = items.find((item) => item.annotation.id === 'annotation_2')!;
    expect(first.stackIndex).toBe(1);
    expect(second.stackIndex).toBe(0);
    expect(second.isStackFront).toBe(true);
  });

  it('uses measured card height to push later annotation groups', () => {
    const items = buildAnnotationRailItems(
      [annotation('annotation_1', 0, 10), annotation('annotation_2', 20, 30)],
      [
        box({ annotationId: 'annotation_1', top: 220 }),
        box({ annotationId: 'annotation_2', top: 250 }),
      ],
      'annotation_1',
      { annotation_1: 340 },
    );

    expect(items.map((item) => [item.annotation.id, item.style.top])).toEqual([
      ['annotation_1', 210],
      ['annotation_2', 568],
    ]);
  });
});

describe('readerAnnotationScrollTop', () => {
  it('centers the selected annotation when there is room', () => {
    expect(
      readerAnnotationScrollTop({
        annotationId: 'annotation_1',
        boxes: [box({ annotationId: 'annotation_1', top: 720, height: 40 })],
        canvasOffsetTop: 24,
        scrollHeight: 1600,
        viewportHeight: 500,
      }),
    ).toBe(514);
  });

  it('keeps the top of the article pinned for early annotations', () => {
    expect(
      readerAnnotationScrollTop({
        annotationId: 'annotation_1',
        boxes: [box({ annotationId: 'annotation_1', top: 40, height: 30 })],
        canvasOffsetTop: 24,
        scrollHeight: 1600,
        viewportHeight: 500,
      }),
    ).toBe(0);
  });

  it('keeps the bottom of the article reachable for late annotations', () => {
    expect(
      readerAnnotationScrollTop({
        annotationId: 'annotation_1',
        boxes: [box({ annotationId: 'annotation_1', top: 1470, height: 40 })],
        canvasOffsetTop: 24,
        scrollHeight: 1600,
        viewportHeight: 500,
      }),
    ).toBe(1100);
  });

  it('returns null when the annotation has no measured highlight box', () => {
    expect(
      readerAnnotationScrollTop({
        annotationId: 'annotation_2',
        boxes: [box({ annotationId: 'annotation_1', top: 720 })],
        canvasOffsetTop: 24,
        scrollHeight: 1600,
        viewportHeight: 500,
      }),
    ).toBeNull();
  });
});
