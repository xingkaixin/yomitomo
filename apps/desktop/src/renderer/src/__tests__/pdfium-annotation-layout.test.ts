// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPdfTextAnchor, createTextAnchor, type Annotation } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import { pdfiumAnnotationNavigationState } from '../source/pdfium/pdfium-annotation-layout';

describe('pdfium annotation layout', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('orders PDF annotation navigation by page, offset, and creation time', () => {
    const annotations = [
      pdfAnnotation('late', 1, 2, '2026-05-25T00:00:02.000Z'),
      pdfAnnotation('first', 0, 8, '2026-05-25T00:00:00.000Z'),
      pdfAnnotation('middle', 1, 2, '2026-05-25T00:00:01.000Z'),
      textAnnotation('web'),
    ];

    expect(pdfiumAnnotationNavigationState(annotations, 'middle', 1)).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'late',
      totalCount: 3,
    });
    expect(pdfiumAnnotationNavigationState(annotations, null, 2)).toEqual({
      currentIndex: 2,
      previousId: 'first',
      nextId: 'middle',
      totalCount: 3,
    });
  });
});

function pdfAnnotation(
  id: string,
  pageIndex: number,
  start: number,
  createdAt: string,
): Annotation {
  return {
    id,
    articleId: 'article',
    anchor: createPdfTextAnchor({
      pageText: '0123456789',
      pageIndex,
      start,
      end: start + 1,
      pageWidth: 100,
      pageHeight: 100,
      rects: [{ x: 0.1, y: 0.1, width: 0.1, height: 0.1 }],
    }),
    author: { kind: 'user', username: 'reader' },
    comments: [],
    color: 'yellow',
    createdAt,
    updatedAt: createdAt,
  } as Annotation;
}

function textAnnotation(id: string, overrides: Partial<Annotation> = {}): Annotation {
  return {
    id,
    articleId: 'article',
    anchor: createTextAnchor('plain article text', 0, 5),
    author: { kind: 'user', username: 'reader' },
    comments: [],
    color: 'yellow',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T00:00:00.000Z',
    ...overrides,
  } as Annotation;
}
