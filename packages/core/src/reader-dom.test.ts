// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  annotationIdsAtHighlightPoint,
  extractTocItems,
  findCurrentTocTarget,
  type HighlightBox,
} from './reader-dom';

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

describe('reader DOM toc', () => {
  it('extracts semantic headings with section ranges from article text offsets', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <h1>Intro</h1>
      <p>Opening</p>
      <h2>Chapter One</h2>
      <p>First body</p>
      <h3>Deep Point</h3>
      <p>Nested body</p>
      <h2>Chapter Two</h2>
      <p>Second body</p>
    `;

    const items = extractTocItems(article);

    expect(items.map((item) => [item.text, item.depth])).toEqual([
      ['Intro', 0],
      ['Chapter One', 1],
      ['Deep Point', 2],
      ['Chapter Two', 1],
    ]);
    expect(items[0]?.end).toBe(items[1]?.start);
    expect(items[1]?.end).toBe(items[3]?.start);
    expect(items[2]?.end).toBe(items[3]?.start);
    expect(items[3]?.end).toBe(article.textContent?.length);
    expect(findCurrentTocTarget(article, items[1]!)).toBe(article.querySelector('h2'));
  });

  it('infers chapter headings when semantic headings are absent', () => {
    const article = document.createElement('article');
    article.innerHTML = `
      <p>一、开场判断</p>
      <p>正文第一段</p>
      <p>2. Follow up</p>
      <p>正文第二段</p>
    `;

    expect(extractTocItems(article).map((item) => item.text)).toEqual([
      '一、开场判断',
      '2. Follow up',
    ]);
  });
});
