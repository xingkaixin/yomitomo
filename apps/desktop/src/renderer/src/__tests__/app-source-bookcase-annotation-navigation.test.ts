import { describe, expect, it } from 'vitest';
import type { HighlightBox } from '@yomitomo/core';
import { createTextAnchor, type Annotation, type ArticleRecord } from '@yomitomo/shared';
import { ebookAnnotationNavigationState } from '../source/ebook/app-source-bookcase-ebook-utils';
import { webAnnotationNavigationState } from '../source/web/app-source-bookcase-web-utils';

const now = '2026-06-08T00:00:00.000Z';

describe('source annotation navigation', () => {
  it('returns full Web navigation state for blank viewport ranges', () => {
    const annotations = [
      annotation('first', 0, 5),
      annotation('second', 100, 106),
      annotation('third', 200, 205),
    ];
    const canvasElement = elementWithOffsetTop(0);
    const scrollElement = elementWithScroll({ clientHeight: 40, scrollTop: 50 });
    const boxes = [
      highlightBox('first', { top: 0, height: 10 }),
      highlightBox('second', { top: 100, height: 10 }),
      highlightBox('third', { top: 200, height: 10 }),
    ];

    expect(
      webAnnotationNavigationState({
        activeId: null,
        annotations,
        boxes,
        canvasElement,
        scrollElement,
      }),
    ).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'second',
      totalCount: 3,
    });
  });

  it('returns full EPUB navigation state for blank page text ranges', () => {
    const annotations = [
      annotation('first', 0, 5),
      annotation('second', 100, 106),
      annotation('third', 200, 205),
    ];
    const article = ebookArticle();

    expect(
      ebookAnnotationNavigationState({
        activeId: null,
        annotations,
        boxes: [],
        pageInfo: { pageCount: 10, pageIndex: 2, sectionIndex: 0 },
        article,
        view: null,
      }),
    ).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'second',
      totalCount: 3,
    });
  });
});

function annotation(id: string, start: number, end: number): Annotation {
  const text = 'x'.repeat(260);
  return {
    id,
    anchor: createTextAnchor(text, start, end),
    author: 'user',
    comments: [],
    color: 'yellow',
    createdAt: now,
    updatedAt: now,
  };
}

function highlightBox(
  annotationId: string,
  box: Pick<HighlightBox, 'top' | 'height'>,
): HighlightBox {
  return {
    id: `${annotationId}-box`,
    annotationId,
    color: 'yellow',
    left: 0,
    top: box.top,
    width: 20,
    height: box.height,
  };
}

function elementWithOffsetTop(offsetTop: number) {
  return { offsetTop } as HTMLElement;
}

function elementWithScroll({
  clientHeight,
  scrollTop,
}: {
  clientHeight: number;
  scrollTop: number;
}) {
  return { clientHeight, scrollTop } as HTMLElement;
}

function ebookArticle() {
  return {
    id: 'article-1',
    title: 'Book',
    url: '',
    canonicalUrl: '',
    contentHtml: '',
    contentHash: 'hash',
    excerpt: '',
    byline: '',
    siteName: '',
    publishedAt: '',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 100,
      },
      chapters: [],
      index: {
        version: 1,
        articleId: 'article-1',
        textLength: 260,
        chapters: [
          {
            id: 'chapter-1',
            href: 'chapter-1.xhtml',
            title: 'Chapter 1',
            indexInBook: 0,
            textStart: 0,
            textEnd: 260,
            textLength: 260,
            previewStart: '',
            previewEnd: '',
            segmentIds: [],
            paragraphIds: [],
          },
        ],
        segments: [],
        paragraphs: [],
      },
    },
  } as ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
}
