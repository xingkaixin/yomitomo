// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageGeometry } from '@embedpdf/models';
import { createPdfTextAnchor, createTextAnchor, type Annotation } from '@yomitomo/shared';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  pdfiumAgentAnnotationRequestOptions,
  pdfiumMapReadingPlanAgentAnnotation,
  pdfiumMapTargetAgentAnnotation,
} from '../source/pdfium/pdfium-agent-plan';
import { buildPdfTextDocument } from '../source/pdfium/pdfium-text-document';

describe('pdfium agent plan', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps reading-plan agent annotations through global PDF text geometry', () => {
    const document = buildPdfTextDocument(['第一页正文', '第二页正文']);
    const firstPage = document.pages[0];
    const secondPage = document.pages[1];
    const unsortedPlan = [
      {
        sectionId: 'second',
        sectionTitle: '第二页',
        sectionStart: secondPage.bodyStart,
        sectionEnd: secondPage.bodyEnd,
        readingIntent: 'challenge' as const,
      },
      {
        sectionId: 'first',
        sectionTitle: '第一页',
        sectionStart: firstPage.bodyStart,
        sectionEnd: firstPage.bodyEnd,
      },
    ];
    const options = pdfiumAgentAnnotationRequestOptions({ readingPlan: unsortedPlan });
    const sourceAnnotation = textAnnotation('agent_plan', {
      anchor: createTextAnchor(document.text, secondPage.bodyStart, secondPage.bodyStart + 2),
      comments: [
        {
          id: 'comment_1',
          author: { kind: 'agent', agentId: 'agent_1', username: 'assistant' },
          content: 'comment',
          createdAt: '2026-05-25T00:00:00.000Z',
        },
      ],
      readingIntent: 'explain',
    });

    const mapped = pdfiumMapReadingPlanAgentAnnotation(
      sourceAnnotation,
      options.readingPlan!,
      document,
      new Map([
        [1, { geometry: glyphGeometry(secondPage.pageText.length), width: 100, height: 100 }],
      ]),
    );

    expect(options.readingPlan?.map((item) => item.sectionId)).toEqual(['first', 'second']);
    expect(mapped?.readingIntent).toBe('challenge');
    expect(mapped?.comments[0]?.readingIntent).toBe('challenge');
    expect(mapped?.anchor).toEqual(
      expect.objectContaining({
        pageIndex: 1,
        start: 0,
        end: 2,
      }),
    );
    expect(mapped).toBeTruthy();
    expect((mapped!.anchor as ReturnType<typeof createPdfTextAnchor>).rects.length).toBeGreaterThan(
      0,
    );
  });

  it('maps target-anchor agent annotations using page-level geometry', () => {
    const pageText = '第一页正文';
    const mapped = pdfiumMapTargetAgentAnnotation({
      annotation: textAnnotation('agent_target', {
        anchor: createTextAnchor(pageText, 1, 3),
      }),
      geometry: glyphGeometry(pageText.length),
      pageHeight: 200,
      pageIndex: 3,
      pageText,
      pageWidth: 100,
    });

    expect(mapped?.anchor).toEqual(
      expect.objectContaining({
        pageIndex: 3,
        start: 1,
        end: 3,
        pageWidth: 100,
        pageHeight: 200,
      }),
    );
    expect(mapped).toBeTruthy();
    expect((mapped!.anchor as ReturnType<typeof createPdfTextAnchor>).rects.length).toBeGreaterThan(
      0,
    );
  });
});

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

function glyphGeometry(length: number): PdfPageGeometry {
  return {
    runs: [
      {
        charStart: 0,
        glyphs: Array.from({ length }, (_, index) => ({
          x: index * 10,
          y: 20,
          width: 10,
          height: 10,
          flags: 0,
        })),
      },
    ],
  } as unknown as PdfPageGeometry;
}
