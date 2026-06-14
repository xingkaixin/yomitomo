// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  annotationIdsAtHighlightPoint,
  articleTitleTocItems,
  buildHighlightSegments,
  extractTocItems,
  findCurrentTocTarget,
  highlightSegmentStyle,
  offsetFromArticleStartIgnoringSelector,
  rangeFromOffsetsIgnoringSelector,
  type HighlightBox,
} from './reader-dom';

function box(input: Partial<HighlightBox> & Pick<HighlightBox, 'annotationId'>): HighlightBox {
  return {
    id: input.id || input.annotationId,
    annotationId: input.annotationId,
    contributorId: input.contributorId,
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

  it('splits overlapping highlights into one painted segment per text span', () => {
    const segments = buildHighlightSegments([
      box({ annotationId: 'annotation_1', color: '#f4c95d', left: 20, width: 100 }),
      box({ annotationId: 'annotation_2', color: '#efa927', left: 60, width: 40 }),
    ]);

    expect(segments.map((segment) => [segment.left, segment.width, segment.colors])).toEqual([
      [20, 40, ['#f4c95d']],
      [60, 40, ['#f4c95d', '#efa927']],
      [100, 20, ['#f4c95d']],
    ]);
  });

  it('splits staggered overlapping highlights without crossing line groups', () => {
    const segments = buildHighlightSegments([
      box({ annotationId: 'annotation_1', color: '#111111', top: 10, left: 20, width: 100 }),
      box({ annotationId: 'annotation_2', color: '#222222', top: 11, left: 60, width: 100 }),
      box({ annotationId: 'annotation_3', color: '#333333', top: 10, left: 80, width: 30 }),
      box({ annotationId: 'annotation_4', color: '#444444', top: 40, left: 20, width: 40 }),
    ]);

    expect(
      segments.map((segment) => [segment.top, segment.left, segment.width, segment.annotationIds]),
    ).toEqual([
      [10, 20, 40, ['annotation_1']],
      [10, 60, 20, ['annotation_1', 'annotation_2']],
      [10, 80, 30, ['annotation_1', 'annotation_3', 'annotation_2']],
      [10, 110, 10, ['annotation_1', 'annotation_2']],
      [11, 120, 40, ['annotation_2']],
      [40, 20, 40, ['annotation_4']],
    ]);
  });

  it('counts overlapping dots by contributor', () => {
    const segments = buildHighlightSegments([
      box({
        annotationId: 'annotation_1',
        contributorId: 'user_1',
        color: '#f4c95d',
        left: 20,
        width: 80,
      }),
      box({
        annotationId: 'annotation_2',
        contributorId: 'user_1',
        color: '#f4c95d',
        left: 40,
        width: 40,
      }),
    ]);

    expect(segments.find((segment) => segment.left === 40)?.colors).toEqual(['#f4c95d']);
  });

  it('places the underline below the text rect and strengthens the active line', () => {
    const segment = buildHighlightSegments([
      box({ annotationId: 'annotation_1', color: '#f4c95d', height: 30 }),
    ])[0];

    expect(highlightSegmentStyle(segment, true)).toMatchObject({
      '--highlight-edge-size': '0px',
      '--highlight-opacity': 1,
      '--highlight-offset': '-4px',
      '--highlight-dot-offset': '-5px',
      '--highlight-thickness': '4px',
    });
    expect(highlightSegmentStyle(segment, false)).toMatchObject({
      '--highlight-edge-size': '0px',
      '--highlight-opacity': 0.62,
      '--highlight-offset': '-4px',
      '--highlight-dot-offset': '-5px',
      '--highlight-thickness': '3px',
    });
  });

  it('reserves line edges for overlapping contributor dots', () => {
    const segment = buildHighlightSegments([
      box({ annotationId: 'annotation_1', contributorId: 'agent_1', color: '#f4c95d' }),
      box({ annotationId: 'annotation_2', contributorId: 'agent_2', color: '#efa927' }),
      box({ annotationId: 'annotation_3', contributorId: 'user_1', color: '#9f8bd1' }),
    ])[0];

    expect(highlightSegmentStyle(segment, false)).toMatchObject({
      '--highlight-edge-size': '22px',
    });
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
    expect(findCurrentTocTarget(article, items[1])).toBe(article.querySelector('h2'));
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

  it('builds a title toc item that targets the article root', () => {
    const article = document.createElement('article');
    article.innerHTML = '<p>正文第一段</p><p>正文第二段</p>';

    const items = articleTitleTocItems(article, ' 测试文章 ');

    expect(items).toEqual([
      {
        index: -1,
        text: '测试文章',
        depth: 0,
        start: 0,
        end: article.textContent?.length,
      },
    ]);
    expect(findCurrentTocTarget(article, items[0])).toBe(article);
    expect(articleTitleTocItems(article, '   ')).toEqual([]);
  });
});

describe('reader DOM translated text boundaries', () => {
  it('maps offsets while ignoring bilingual translation nodes', () => {
    const article = document.createElement('article');
    article.innerHTML =
      '<p>Alpha source</p><div data-reader-translation="true">阿尔法译文</div><p>Beta source</p>';

    const betaText = article.querySelectorAll('p')[1]?.firstChild;
    expect(betaText).toBeTruthy();
    expect(
      offsetFromArticleStartIgnoringSelector(
        article,
        betaText as Text,
        4,
        '[data-reader-translation]',
      ),
    ).toBe('Alpha sourceBeta'.length);

    const range = rangeFromOffsetsIgnoringSelector(
      article,
      'Alpha source'.length,
      'Alpha sourceBeta'.length,
      '[data-reader-translation]',
    );

    expect(range?.toString()).toBe('Beta');
  });
});
