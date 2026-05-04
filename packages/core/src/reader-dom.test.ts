import { describe, expect, it } from 'vitest';
import { annotationIdsAtHighlightPoint, type HighlightBox } from './reader-dom';

function box(input: Partial<HighlightBox> & Pick<HighlightBox, 'annotationId'>): HighlightBox {
  return {
    id: input.id || input.annotationId,
    annotationId: input.annotationId,
    color: input.color || '#f4c95d',
    top: input.top ?? 10,
    left: input.left ?? 20,
    width: input.width ?? 80,
    height: input.height ?? 18,
  };
}

describe('reader DOM highlights', () => {
  it('returns every annotation under the clicked highlight point once', () => {
    const boxes = [
      box({ annotationId: 'annotation_1' }),
      box({ annotationId: 'annotation_1', top: 40 }),
      box({ annotationId: 'annotation_2', left: 40, width: 60 }),
      box({ annotationId: 'annotation_3', left: 140 }),
    ];

    expect(annotationIdsAtHighlightPoint(boxes, { x: 48, y: 16 })).toEqual([
      'annotation_1',
      'annotation_2',
    ]);
  });

  it('uses optional padding for near-edge clicks', () => {
    expect(
      annotationIdsAtHighlightPoint([box({ annotationId: 'annotation_1' })], { x: 18, y: 9 }),
    ).toEqual([]);
    expect(
      annotationIdsAtHighlightPoint([box({ annotationId: 'annotation_1' })], { x: 18, y: 9 }, 2),
    ).toEqual(['annotation_1']);
  });
});
