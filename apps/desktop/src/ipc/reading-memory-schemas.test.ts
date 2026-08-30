import { describe, expect, it } from 'vitest';
import type { PdfTextAnchor, TextAnchor } from '@yomitomo/shared';
import { validateDesktopIpcInvokeArgs } from '../ipc-schemas';
import type { ReadingRelationsSearchInput } from './reading-memory-domain';
import { readingMemoryIpcInvokeSchemas } from './reading-memory-schemas';

const textAnchor: TextAnchor = {
  exact: 'A reading selection',
  prefix: 'Before ',
  suffix: ' after',
  start: 7,
  end: 26,
  paragraphId: 'paragraph-1',
  chapterId: 'chapter-1',
  segmentId: 'segment-1',
  textStartInParagraph: 7,
  textEndInParagraph: 26,
  textStartInBook: 1007,
  textEndInBook: 1026,
  quoteHash: 'quote-hash',
};

const pdfAnchor: PdfTextAnchor = {
  ...textAnchor,
  kind: 'pdf-text',
  pageIndex: 3,
  pageWidth: 612,
  pageHeight: 792,
  rects: [{ x: 0.1, y: 0.2, width: 0.4, height: 0.03 }],
};

const searchInput: ReadingRelationsSearchInput = {
  requestId: 'request-1',
  articleId: 'article-1',
  context: {
    sourceType: 'ebook',
    quote: textAnchor.exact,
    title: 'A book',
    locationLabel: 'Chapter one',
    anchor: textAnchor,
    nearbyText: 'Before A reading selection after',
  },
  question: 'How does this relate to my earlier reading?',
};

describe('reading memory IPC schemas', () => {
  it.each(['web', 'ebook', 'pdf', 'text'] as const)(
    'preserves the complete %s context through aggregate IPC validation',
    (sourceType) => {
      const input: ReadingRelationsSearchInput = {
        ...searchInput,
        context: {
          ...searchInput.context,
          sourceType,
          anchor: sourceType === 'pdf' ? pdfAnchor : textAnchor,
        },
      };

      expect(validateDesktopIpcInvokeArgs('reading-memory:relations:search', [input])).toEqual([
        input,
      ]);
    },
  );

  it('accepts a selection without optional metadata', () => {
    const input: ReadingRelationsSearchInput = {
      requestId: 'request-1',
      articleId: 'article-1',
      context: { sourceType: 'web', quote: 'A selection' },
    };

    expect(validateDesktopIpcInvokeArgs('reading-memory:relations:search', [input])).toEqual([
      input,
    ]);
  });

  it.each([
    { ...searchInput, evidence: [] },
    { ...searchInput, authorize: true },
    { ...searchInput, confirmPrivacy: true },
    { ...searchInput, scope: { kind: 'library' } },
    { ...searchInput, context: { ...searchInput.context, evidence: [] } },
    {
      ...searchInput,
      context: { ...searchInput.context, anchor: { ...textAnchor, authorize: true } },
    },
    {
      ...searchInput,
      context: {
        ...searchInput.context,
        sourceType: 'pdf',
        anchor: {
          ...pdfAnchor,
          rects: [{ ...pdfAnchor.rects[0], untrusted: 'extra' }],
        },
      },
    },
  ])('rejects unknown fields at every search input level: %#', (input) => {
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:relations:search'].safeParse([input]),
    ).toMatchObject({ success: false });
  });

  it.each([
    { ...searchInput, requestId: '' },
    { ...searchInput, requestId: 'x'.repeat(129) },
    { ...searchInput, articleId: 'x'.repeat(257) },
    { ...searchInput, question: 'x'.repeat(10_001) },
    { ...searchInput, context: { ...searchInput.context, quote: '' } },
    { ...searchInput, context: { ...searchInput.context, quote: 'x'.repeat(100_001) } },
    { ...searchInput, context: { ...searchInput.context, nearbyText: 'x'.repeat(100_001) } },
    { ...searchInput, context: { ...searchInput.context, title: 'x'.repeat(10_001) } },
    { ...searchInput, context: { ...searchInput.context, locationLabel: 'x'.repeat(1001) } },
  ])('rejects empty required text and oversized search material: %#', (input) => {
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:relations:search'].safeParse([input]),
    ).toMatchObject({ success: false });
  });

  it.each([
    { ...textAnchor, start: -1 },
    { ...textAnchor, start: 0.5 },
    { ...textAnchor, end: Number.MAX_SAFE_INTEGER + 1 },
    { ...textAnchor, start: 30, end: 20 },
    { ...textAnchor, textStartInParagraph: 30, textEndInParagraph: 20 },
    { ...textAnchor, textStartInBook: 30, textEndInBook: 20 },
    { ...textAnchor, exact: 'x'.repeat(100_001) },
    { ...textAnchor, prefix: 'x'.repeat(100_001) },
    { ...textAnchor, suffix: 'x'.repeat(100_001) },
    { ...textAnchor, chapterId: 'x'.repeat(257) },
    { ...pdfAnchor, pageIndex: -1 },
    { ...pdfAnchor, pageWidth: 0 },
    { ...pdfAnchor, pageHeight: Infinity },
    { ...pdfAnchor, rects: [{ x: 0, y: 0, width: 2, height: 0.1 }] },
    { ...pdfAnchor, rects: Array.from({ length: 4097 }, () => pdfAnchor.rects[0]) },
    { ...textAnchor, kind: 'pdf-text' },
  ])('rejects malformed or oversized anchors without falling back to text fields: %#', (anchor) => {
    const input = { ...searchInput, context: { ...searchInput.context, anchor } };

    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:relations:search'].safeParse([input]),
    ).toMatchObject({ success: false });
  });

  it.each(['reading-memory:relations:judge', 'reading-memory:relations:cancel'] as const)(
    '%s accepts only one bounded request identifier',
    (channel) => {
      const schema = readingMemoryIpcInvokeSchemas[channel];

      expect(validateDesktopIpcInvokeArgs(channel, [{ requestId: 'request-1' }])).toEqual([
        { requestId: 'request-1' },
      ]);
      for (const args of [
        [],
        [{ requestId: '' }],
        [{ requestId: 'x'.repeat(129) }],
        [{ requestId: 'request-1', evidence: [] }],
        [{ requestId: 'request-1', authorize: true }],
        [{ requestId: 'request-1', confirmPrivacy: true }],
        [{ requestId: 'request-1' }, true],
      ]) {
        expect(schema.safeParse(args)).toMatchObject({ success: false });
      }
    },
  );
});
