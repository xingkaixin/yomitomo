import {
  createPdfTextAnchor,
  type ReaderQuestionContext,
  type ReadingEvidence,
  type TextAnchor,
} from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { selectReadingRelationEvidence } from './reading-relation-evidence';

describe('selectReadingRelationEvidence', () => {
  it('excludes the selected assets and nearby repeated source text, not other judgments', () => {
    const selection = anchor(100, 120, 'selected passage', { paragraphId: 'paragraph' });
    const earlier = evidence('earlier', 'current', anchor(10, 20, 'earlier passage'));
    const nearbyJudgment = evidence(
      'nearby-judgment',
      'current',
      anchor(120, 140, selection.exact, { paragraphId: 'paragraph' }),
    );
    const anotherArticle = evidence('another-article', 'other', selection);

    const result = selectReadingRelationEvidence(
      [
        source('selected-source', 'current', selection),
        evidence('selected-comment', 'current', selection),
        evidence('overlapping-comment', 'current', anchor(110, 130, 'overlapping passage')),
        source(
          'repeated-source',
          'current',
          anchor(120, 140, ' selected\n passage ', { paragraphId: 'paragraph' }),
        ),
        earlier,
        nearbyJudgment,
        anotherArticle,
      ],
      { articleId: 'current', context: context(selection) },
    );

    expect(result).toEqual([earlier, nearbyJudgment, anotherArticle]);
  });

  it('preserves different and opposing judgments on the same quote', () => {
    const quote = anchor(10, 30, 'the shared original passage', { paragraphId: 'paragraph' });
    const supporting = evidence('I agree with this claim', 'current', quote);
    const opposing = evidence('I disagree with this claim', 'current', quote);

    expect(
      selectReadingRelationEvidence([supporting, opposing], {
        articleId: 'current',
        context: context(anchor(100, 120, 'a later passage', { paragraphId: 'paragraph' })),
      }),
    ).toEqual([supporting, opposing]);
  });

  it('prefers user judgments and then other articles only among matching text and quotes', () => {
    const quote = anchor(10, 20, 'a shared quote');
    const localAi = {
      ...evidence('local-ai', 'current', quote),
      content: 'Café\n idea',
      authorKind: 'ai' as const,
    };
    const externalAi = {
      ...localAi,
      id: 'external-ai',
      source: evidence('unused', 'other', quote).source,
    };
    const localUser = { ...evidence('local-user', 'current', quote), content: 'Cafe\u0301 idea' };
    const externalUser = {
      ...evidence('external-user', 'other', { ...quote, exact: 'a  shared\nquote' }),
      content: 'Café idea',
    };
    const distinctQuote = {
      ...evidence('distinct-quote', 'current', anchor(30, 40, 'a different quote')),
      content: 'Café idea',
    };

    expect(
      selectReadingRelationEvidence([externalAi, localUser], {
        articleId: 'current',
        context: context(anchor(100, 120, 'selection')),
      }),
    ).toEqual([localUser]);
    expect(
      selectReadingRelationEvidence([localAi, externalAi, localUser, externalUser, distinctQuote], {
        articleId: 'current',
        context: context(anchor(100, 120, 'selection')),
      }),
    ).toEqual([externalUser, distinctQuote]);
  });

  it('applies the three-card diversity bound and retains relevant earlier same-article evidence', () => {
    const current = { articleId: 'current', context: context(anchor(100, 120, 'selection')) };
    const local = Array.from({ length: 3 }, (_, index) =>
      evidence(`local-${index}`, 'current', anchor(index * 10, index * 10 + 5, `passage ${index}`)),
    );
    const external = evidence('external', 'other', anchor(0, 5, 'another passage'));

    expect(selectReadingRelationEvidence([...local, external], current)).toEqual([
      local[0],
      local[1],
      external,
    ]);
    expect(selectReadingRelationEvidence(local, current)).toEqual(local);
    expect(selectReadingRelationEvidence([local[0]], current)).toEqual([local[0]]);
  });

  it.each(['web', 'text'] as const)(
    'keeps %s original and translated-block coordinates separate',
    (sourceType) => {
      const selection = anchor(10, 20, 'selection', { segmentId: 'translation-a' });
      const original = evidence('original', 'current', anchor(10, 20, 'original passage'));
      const anotherBlock = evidence(
        'another-block',
        'current',
        anchor(10, 20, 'other translation', { segmentId: 'translation-b' }),
      );

      expect(
        selectReadingRelationEvidence(
          [evidence('selected-translation', 'current', selection), original, anotherBlock],
          { articleId: 'current', context: context(selection, sourceType) },
        ),
      ).toEqual([original, anotherBlock]);
    },
  );

  it('compares PDF offsets only within the same page', () => {
    const selection = createPdfTextAnchor({
      pageText: 'the selected PDF passage',
      start: 0,
      end: 12,
      pageIndex: 1,
      pageWidth: 600,
      pageHeight: 800,
      rects: [],
    });
    const secondPage = { ...selection, pageIndex: 2 };
    const otherPage = evidence('other-page', 'current', secondPage);
    const unpaged = evidence('unpaged', 'current', anchor(0, 12, selection.exact));

    expect(
      selectReadingRelationEvidence(
        [evidence('same-page', 'current', selection), otherPage, unpaged],
        { articleId: 'current', context: context(selection, 'pdf') },
      ),
    ).toEqual([otherPage, unpaged]);
  });

  it('uses paired EPUB book offsets and does not confuse different chapters', () => {
    const selection = anchor(0, 10, 'selection', {
      chapterId: 'chapter-2',
      textStartInBook: 100,
      textEndInBook: 110,
    });
    const earlier = evidence(
      'earlier',
      'current',
      anchor(0, 10, 'earlier passage', {
        chapterId: 'chapter-2',
        textStartInBook: 80,
        textEndInBook: 90,
      }),
    );
    const otherChapter = evidence(
      'other-chapter',
      'current',
      anchor(0, 10, 'another chapter', {
        chapterId: 'chapter-3',
      }),
    );
    const adjacent = evidence(
      'adjacent',
      'current',
      anchor(90, 100, 'adjacent passage', {
        chapterId: 'chapter-2',
      }),
    );

    expect(
      selectReadingRelationEvidence(
        [
          evidence(
            'overlapping',
            'current',
            anchor(20, 30, 'overlap', {
              chapterId: 'chapter-2',
              textStartInBook: 105,
              textEndInBook: 115,
            }),
          ),
          earlier,
          otherChapter,
          adjacent,
        ],
        { articleId: 'current', context: context(selection, 'ebook') },
      ),
    ).toEqual([earlier, otherChapter, adjacent]);
  });

  it('does not infer a selection location from text or invalid offsets', () => {
    const current = evidence('current-judgment', 'current', anchor(10, 20, 'selection'));

    for (const selected of [
      undefined,
      anchor(Number.NaN, 20, 'selection'),
      anchor(10, 10, 'selection'),
    ]) {
      expect(
        selectReadingRelationEvidence([current], {
          articleId: 'current',
          context: { sourceType: 'web', quote: 'selection', anchor: selected },
        }),
      ).toEqual([current]);
    }
  });

  it('keeps the first instance of an evidence ID, ignores empty content, and does not mutate inputs', () => {
    const first = evidence('first', 'other', anchor(0, 5, 'first quote'));
    const duplicate = { ...first, content: 'a later duplicate ID' };
    const empty = { ...evidence('empty', 'other', anchor(10, 20, 'empty quote')), content: ' \n ' };
    const candidates = Object.freeze([first, duplicate, empty]);

    const result = selectReadingRelationEvidence(candidates, {
      articleId: 'current',
      context: context(anchor(100, 120, 'selection')),
    });

    expect(result).toEqual([first]);
    expect(result[0]).toBe(first);
    expect(candidates).toEqual([first, duplicate, empty]);
  });
});

function context(
  textAnchor: TextAnchor,
  sourceType: ReaderQuestionContext['sourceType'] = 'web',
): ReaderQuestionContext {
  return { sourceType, quote: textAnchor.exact, anchor: textAnchor };
}

function anchor(
  start: number,
  end: number,
  exact: string,
  extra: Partial<TextAnchor> = {},
): TextAnchor {
  return { exact, prefix: '', suffix: '', start, end, ...extra };
}

function evidence(id: string, articleId: string, textAnchor: TextAnchor): ReadingEvidence {
  return {
    id,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: id,
    sourceVersion: 'version-1',
    source: { ref: { kind: 'article', id: articleId }, sourceType: 'web', title: articleId },
    location: { annotationId: `annotation-${id}`, commentId: id, anchor: textAnchor },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function source(id: string, articleId: string, textAnchor: TextAnchor): ReadingEvidence {
  return {
    ...evidence(id, articleId, textAnchor),
    assetType: 'annotation',
    role: 'source',
    content: textAnchor.exact,
  };
}
