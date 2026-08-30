import { describe, expect, it } from 'vitest';
import type { PdfTextAnchor, ReadingEvidenceScope, TextAnchor } from '@yomitomo/shared';
import { validateDesktopIpcInvokeArgs } from '../ipc-schemas';
import {
  readingLibrarySourceLimit,
  readingReviewAnswerLimit,
  type ReadingLibrarySearchInput,
  type ReadingRelationsSearchInput,
} from './reading-memory-domain';
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

describe('reading review IPC authorization inputs', () => {
  const asset = {
    articleId: 'article-1',
    annotationId: 'annotation-1',
    assetType: 'comment',
    assetId: 'comment-1',
  };

  it('requires the complete asset identity and rejects renderer snapshots', () => {
    const schema = readingMemoryIpcInvokeSchemas['reading-memory:review:start'];
    expect(schema.parse([{ requestId: 'request-1', asset }])).toEqual([
      { requestId: 'request-1', asset },
    ]);
    expect(
      schema.safeParse([
        { requestId: 'request-1', asset: { assetType: 'comment', assetId: 'comment-1' } },
      ]).success,
    ).toBe(false);
    expect(
      schema.safeParse([
        { requestId: 'request-1', asset, judgmentSnapshot: 'untrusted old judgment' },
      ]).success,
    ).toBe(false);
    expect(
      schema.safeParse([{ requestId: 'request-1', asset: { ...asset, assetVersion: 'untrusted' } }])
        .success,
    ).toBe(false);
  });

  it('accepts an empty reveal and bounds the frozen blind answer', () => {
    const schema = readingMemoryIpcInvokeSchemas['reading-memory:review:reveal'];
    expect(schema.parse([{ requestId: 'request-1', answer: '  ' }])).toEqual([
      { requestId: 'request-1', answer: '' },
    ]);
    expect(schema.parse([{ requestId: 'request-1', answer: '  current view  ' }])[0].answer).toBe(
      'current view',
    );
    expect(
      schema.safeParse([{ requestId: 'request-1', answer: 'x'.repeat(readingReviewAnswerLimit) }])
        .success,
    ).toBe(true);
    expect(
      schema.safeParse([
        { requestId: 'request-1', answer: 'x'.repeat(readingReviewAnswerLimit + 1) },
      ]).success,
    ).toBe(false);
  });

  it('submits only a stable event id and decision, not a mutable answer or version', () => {
    const schema = readingMemoryIpcInvokeSchemas['reading-memory:review:submit'];
    for (const decision of ['still_agree', 'changed', 'need_evidence']) {
      expect(
        schema.parse([{ requestId: 'request-1', eventId: 'event-1', decision }])[0].decision,
      ).toBe(decision);
    }
    const input = { requestId: 'request-1', eventId: 'event-1', decision: 'changed' };
    expect(schema.safeParse([{ ...input, answer: 'rewritten after reveal' }]).success).toBe(false);
    expect(schema.safeParse([{ ...input, judgmentDigest: 'forged' }]).success).toBe(false);
    expect(schema.safeParse([{ ...input, decision: 'delete' }]).success).toBe(false);
    expect(schema.safeParse([{ ...input, eventId: '' }]).success).toBe(false);
  });

  it('keeps comparison ownership separate from session cancellation and rejects supplied evidence', () => {
    const input = { requestId: 'request-1', comparisonId: 'comparison-1' };
    const cancel = readingMemoryIpcInvokeSchemas['reading-memory:review:cancel'];
    expect(cancel.parse([input])).toEqual([input]);
    expect(cancel.parse([{ requestId: input.requestId }])).toEqual([
      { requestId: input.requestId },
    ]);
    const search = readingMemoryIpcInvokeSchemas['reading-memory:review:search-evidence'];
    expect(
      search.parse([{ ...input, expectedRouteRevision: 'a'.repeat(64) }])[0].comparisonId,
    ).toBe(input.comparisonId);
    expect(search.safeParse([{ ...input, expectedRouteRevision: 'new-target' }]).success).toBe(
      false,
    );
    const compare = readingMemoryIpcInvokeSchemas['reading-memory:review:compare-evidence'];
    expect(compare.parse([input])).toEqual([input]);
    expect(compare.safeParse([{ ...input, evidence: [] }]).success).toBe(false);
    expect(compare.safeParse([{ ...input, authorize: true }]).success).toBe(false);
  });

  it('bounds history paging to an exact cursor instead of caller-selected limits', () => {
    const schema = readingMemoryIpcInvokeSchemas['reading-memory:review:history'];
    const cursor = { createdAt: '2026-08-30T00:00:00.000Z', id: 'event-1' };
    expect(schema.parse([{ requestId: 'request-1', cursor }])[0].cursor).toEqual(cursor);
    expect(
      schema.safeParse([{ requestId: 'request-1', cursor: { ...cursor, createdAt: 'yesterday' } }])
        .success,
    ).toBe(false);
    expect(
      schema.safeParse([
        {
          requestId: 'request-1',
          cursor: { ...cursor, createdAt: `2026-08-30T00:00:00.${'0'.repeat(64)}Z` },
        },
      ]).success,
    ).toBe(false);
    expect(schema.safeParse([{ requestId: 'request-1', limit: 100_000 }]).success).toBe(false);
  });
});

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

  it.each([
    'reading-memory:relations:judge',
    'reading-memory:relations:cancel',
    'reading-memory:library:answer',
    'reading-memory:library:cancel',
  ] as const)('%s accepts only one bounded request identifier', (channel) => {
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
  });
});

const librarySearchInput: ReadingLibrarySearchInput = {
  requestId: 'library-request',
  question: 'What have I learned about memory?',
  scope: { kind: 'library' },
  expectedRouteRevision: 'ab'.repeat(32),
};

describe('reading library IPC schemas', () => {
  it.each<ReadingEvidenceScope>([
    { kind: 'library' },
    { kind: 'collection', collectionId: 'collection-1' },
    {
      kind: 'sources',
      sources: [
        { kind: 'article', id: 'article-1' },
        { kind: 'article', id: 'article-1' },
      ],
    },
  ])('preserves an explicit scope and leaves source deduplication to main: %#', (scope) => {
    expect(validateDesktopIpcInvokeArgs('reading-memory:library:context', [{ scope }])).toEqual([
      { scope },
    ]);
    const input = { ...librarySearchInput, scope };
    expect(validateDesktopIpcInvokeArgs('reading-memory:library:search', [input])).toEqual([input]);
  });

  it('allows empty manual selection only when inspecting context, never when searching', () => {
    const scope: ReadingEvidenceScope = { kind: 'sources', sources: [] };

    expect(validateDesktopIpcInvokeArgs('reading-memory:library:context', [{ scope }])).toEqual([
      { scope },
    ]);
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([
        { ...librarySearchInput, scope },
      ]),
    ).toMatchObject({ success: false });
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:context'].safeParse([{}]),
    ).toMatchObject({ success: false });
    const { scope: _scope, ...withoutScope } = librarySearchInput;
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([withoutScope]),
    ).toMatchObject({ success: false });
  });

  it('accepts the shared source limit and rejects an oversized source list', () => {
    const sources = Array.from({ length: readingLibrarySourceLimit }, (_, index) => ({
      kind: 'article' as const,
      id: `article-${index}`,
    }));
    const scope: ReadingEvidenceScope = { kind: 'sources', sources };
    expect(
      validateDesktopIpcInvokeArgs('reading-memory:library:search', [
        { ...librarySearchInput, scope },
      ])[0].scope,
    ).toEqual(scope);

    const oversized = { kind: 'sources', sources: [...sources, { kind: 'article', id: 'extra' }] };
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:context'].safeParse([
        { scope: oversized },
      ]),
    ).toMatchObject({ success: false });
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([
        { ...librarySearchInput, scope: oversized },
      ]),
    ).toMatchObject({ success: false });
  });

  it.each([
    { kind: 'unknown' },
    { kind: 'library', collectionId: 'unexpected' },
    { kind: 'collection' },
    { kind: 'collection', collectionId: '' },
    { kind: 'collection', collectionId: 'x'.repeat(257) },
    { kind: 'sources', sources: [{ kind: 'weread', id: 'book-1' }] },
    { kind: 'sources', sources: [{ kind: 'article', id: '' }] },
    { kind: 'sources', sources: [{ kind: 'article', id: 'x'.repeat(257) }] },
    { kind: 'sources', sources: [{ kind: 'article', id: 'article-1', evidence: [] }] },
    { kind: 'sources', sources: [{ kind: 'article', id: 'article-1' }], authorize: true },
  ])('rejects malformed, unsupported or expanded scopes at both entry points: %#', (scope) => {
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:context'].safeParse([{ scope }]),
    ).toMatchObject({ success: false });
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([
        { ...librarySearchInput, scope },
      ]),
    ).toMatchObject({ success: false });
  });

  it('trims the question and accepts its maximum normalized size', () => {
    const question = 'x'.repeat(10_000);
    const input = { ...librarySearchInput, question: ` \n${question}\t ` };

    expect(validateDesktopIpcInvokeArgs('reading-memory:library:search', [input])[0].question).toBe(
      question,
    );
  });

  it.each([
    { requestId: '' },
    { requestId: 'x'.repeat(129) },
    { question: '' },
    { question: ' \n\t ' },
    { question: 'x'.repeat(10_001) },
    { expectedRouteRevision: '' },
    { expectedRouteRevision: 'AB'.repeat(32) },
    { expectedRouteRevision: 'g'.repeat(64) },
    { expectedRouteRevision: 'a'.repeat(63) },
    { expectedRouteRevision: 'a'.repeat(65) },
    { expectedRouteRevision: undefined },
  ])('rejects invalid request identifiers, questions or route revisions: %#', (patch) => {
    expect(
      readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([
        { ...librarySearchInput, ...patch },
      ]),
    ).toMatchObject({ success: false });
  });

  it.each(['evidence', 'authorize', 'confirmPrivacy', 'provider', 'sourceCount'])(
    'does not accept renderer-owned %s on a context or search request',
    (field) => {
      expect(
        readingMemoryIpcInvokeSchemas['reading-memory:library:context'].safeParse([
          { scope: librarySearchInput.scope, [field]: true },
        ]),
      ).toMatchObject({ success: false });
      expect(
        readingMemoryIpcInvokeSchemas['reading-memory:library:search'].safeParse([
          { ...librarySearchInput, [field]: true },
        ]),
      ).toMatchObject({ success: false });
    },
  );
});
