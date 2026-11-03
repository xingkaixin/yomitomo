import type { ReadingEvidence } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { validateReadingJudgment } from './reading-judgment-validation';

describe('reading judgment validation', () => {
  it('does not treat need-evidence as a settled user position but retains its supporting and gap citations', () => {
    const current = fixture().current;
    current[0] = {
      ...current[0],
      review: { decision: 'need_evidence', reviewedAt: '2026-08-30T00:00:00.000Z' },
    };
    const sent = new Map(current.map((item, index) => [`e${index + 1}`, item]));
    const result = validateReadingJudgment(
      'library-answer',
      answer({
        judgments: [
          { text: 'Only an unsettled judgment', evidenceIds: ['e1'] },
          { text: 'A position with independent support', evidenceIds: ['e1', 'e2'] },
        ],
        supporting: [{ text: 'A tentative observation', evidenceIds: ['e1'] }],
        gaps: [{ text: 'This observation still needs evidence', evidenceIds: ['e1'] }],
      }),
      sent,
      current,
    );
    expect(result).toEqual({
      kind: 'library-answer',
      ...answer({
        judgments: [
          {
            text: 'A position with independent support',
            evidenceIds: [current[0].id, current[1].id],
          },
        ],
        supporting: [{ text: 'A tentative observation', evidenceIds: [current[0].id] }],
        gaps: [{ text: 'This observation still needs evidence', evidenceIds: [current[0].id] }],
      }),
    });
    expect(
      validateReadingJudgment(
        'library-answer',
        answer({ judgments: [{ text: 'Only an unsettled judgment', evidenceIds: ['e1'] }] }),
        sent,
        current,
      ),
    ).toBeNull();
  });

  it('rejects every relation for a repeated reference even if a duplicate item is malformed', () => {
    const { sent, current } = fixture();
    const valid = { evidenceId: 'e2', relation: 'opposite', explanation: 'A valid disagreement.' };
    const value = {
      relations: [
        { evidenceId: 'e1', relation: 'same', explanation: 'First interpretation.' },
        { evidenceId: 'e1', relation: 'invented', explanation: '' },
        valid,
        { evidenceId: 'e3', relation: 'same', explanation: 'First duplicate.' },
        { evidenceId: 'e3', relation: 'complementary', explanation: 'Second duplicate.' },
      ],
    };

    expect(validateReadingJudgment('reading-relations', value, sent, current)).toEqual({
      kind: 'reading-relations',
      relations: [{ ...valid, evidenceId: current[1].id }],
    });
  });

  it('allows explicit relation abstention but rejects nonempty answers with no valid relations', () => {
    const { sent, current } = fixture();
    for (const kind of ['reading-relations', 'evidence-comparison'] as const) {
      expect(validateReadingJudgment(kind, { relations: [] }, sent, current)).toEqual({
        kind,
        relations: [],
      });
      expect(validateReadingJudgment(kind, { relations: [null] }, sent, current)).toBeNull();
    }
  });

  it('attributes past judgments only to cited user judgments while keeping other supporting evidence', () => {
    const evidence = fixture().current;
    const current: ReadingEvidence[] = [
      { ...evidence[0], assetType: 'distillation' },
      { ...evidence[1], authorKind: 'ai' },
      { ...evidence[2], assetType: 'distillation', authorKind: 'ai' },
      { ...evidence[0], id: 'local-source', assetType: 'annotation', role: 'source' },
    ];
    const sent = new Map(current.map((item, index) => [`e${index + 1}`, item]));
    const supporting = [
      { text: 'Assistant observation', evidenceIds: ['e2'] },
      { text: 'Published distillation', evidenceIds: ['e3'] },
      { text: 'Original source', evidenceIds: ['e4'] },
    ];

    expect(
      validateReadingJudgment(
        'library-answer',
        answer({
          judgments: [
            { text: 'User judgment with supporting discussion', evidenceIds: ['e1', 'e2'] },
            ...supporting,
          ],
          supporting,
        }),
        sent,
        current,
      ),
    ).toEqual({
      kind: 'library-answer',
      ...answer({
        judgments: [
          {
            text: 'User judgment with supporting discussion',
            evidenceIds: [current[0].id, current[1].id],
          },
        ],
        supporting: supporting.map((claim, index) => ({
          ...claim,
          evidenceIds: [current[index + 1].id],
        })),
      }),
    });
    expect(
      validateReadingJudgment('library-answer', answer({ judgments: supporting }), sent, current),
    ).toBeNull();
  });
});

function fixture() {
  const current = ['a', 'b', 'c'].map((id): ReadingEvidence => ({
    id: `local-evidence-${id}`,
    assetType: 'comment',
    role: 'judgment',
    authorKind: 'user',
    content: `Stored judgment ${id}`,
    sourceVersion: `version-${id}`,
    source: {
      ref: { kind: 'article', id: `article-${id}` },
      sourceType: 'web',
      title: `Source ${id}`,
    },
    location: {
      annotationId: `annotation-${id}`,
      commentId: `comment-${id}`,
      anchor: { exact: id, prefix: '', suffix: '', start: 0, end: 1 },
    },
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }));
  return { current, sent: new Map(current.map((item, index) => [`e${index + 1}`, item])) };
}

function answer(sections: Record<string, unknown> = {}) {
  return { judgments: [], supporting: [], opposingOrLimiting: [], gaps: [], ...sections };
}
