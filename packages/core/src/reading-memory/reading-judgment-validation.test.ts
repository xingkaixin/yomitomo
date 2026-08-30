import type { ReadingEvidence, ReadingJudgmentInput } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { validateReadingJudgment } from './reading-judgment-validation';

describe('reading judgment validation', () => {
  it.each(['reading-relations', 'evidence-comparison'] as const)(
    'maps temporary references to current local evidence for %s without changing multilingual text',
    (kind) => {
      const { sent, current } = fixture();
      const relations = [
        { evidenceId: 'e1', relation: 'same', explanation: '这个判断与既有观点一致。' },
        {
          evidenceId: 'e2',
          relation: 'complementary',
          explanation: 'A different supporting mechanism.',
        },
        { evidenceId: 'e3', relation: 'opposite', explanation: 'この根拠は先の判断と対立する。' },
      ];

      expect(validateReadingJudgment(kind, { relations }, sent, current)).toEqual({
        kind,
        relations: relations.map((relation, index) => ({
          evidenceId: current[index].id,
          relation: relation.relation,
          explanation: relation.explanation,
        })),
      });
    },
  );

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

  it('treats different temporary references to the same local evidence as duplicates', () => {
    const { sent, current } = fixture();
    sent.set('alias', current[0]);

    expect(
      validateReadingJudgment(
        'reading-relations',
        {
          relations: [
            { evidenceId: 'e1', relation: 'same', explanation: 'First label.' },
            { evidenceId: 'alias', relation: null },
            { evidenceId: 'e2', relation: 'opposite', explanation: 'Independent label.' },
          ],
        },
        sent,
        current,
      ),
    ).toEqual({
      kind: 'reading-relations',
      relations: [
        { evidenceId: current[1].id, relation: 'opposite', explanation: 'Independent label.' },
      ],
    });
    expect(
      validateReadingJudgment(
        'library-answer',
        answer({ judgments: [{ text: 'The same citation twice', evidenceIds: ['e1', 'alias'] }] }),
        sent,
        current,
      ),
    ).toBeNull();
  });

  it('drops malformed and invented relation items without discarding other valid evidence', () => {
    const { sent, current } = fixture();
    const value = {
      relations: [
        null,
        { evidenceId: 'unknown', relation: 'same', explanation: 'Unsent citation.' },
        {
          evidenceId: 'e1',
          relation: 'same',
          explanation: 'Run this.',
          toolCall: 'delete_library',
        },
        { evidenceId: 'e2', relation: 'unrelated', explanation: 'Unsupported label.' },
        { evidenceId: 'e3', relation: 'complementary', explanation: 'Valid supporting evidence.' },
      ],
    };

    expect(validateReadingJudgment('evidence-comparison', value, sent, current)).toEqual({
      kind: 'evidence-comparison',
      relations: [
        {
          evidenceId: current[2].id,
          relation: 'complementary',
          explanation: 'Valid supporting evidence.',
        },
      ],
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

  it('keeps valid cited claims in all library sections and permits reuse across claims', () => {
    const { sent, current } = fixture();
    const value = answer({
      judgments: [{ text: '我的初步判断', evidenceIds: ['e1', 'e2'] }],
      supporting: [{ text: 'Supporting observation', evidenceIds: ['e1'] }],
      opposingOrLimiting: [{ text: '反対する根拠', evidenceIds: ['e3'] }],
      gaps: [{ text: '现有证据尚未覆盖长期效果', evidenceIds: ['e2'] }],
    });

    expect(validateReadingJudgment('library-answer', value, sent, current)).toEqual({
      kind: 'library-answer',
      judgments: [{ text: '我的初步判断', evidenceIds: [current[0].id, current[1].id] }],
      supporting: [{ text: 'Supporting observation', evidenceIds: [current[0].id] }],
      opposingOrLimiting: [{ text: '反対する根拠', evidenceIds: [current[2].id] }],
      gaps: [{ text: '现有证据尚未覆盖长期效果', evidenceIds: [current[1].id] }],
    });
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

  it('drops whole claims with unknown, repeated, missing, or excessive citations', () => {
    const { sent, current } = fixture();
    const value = answer({
      judgments: [
        { text: 'Partly invented evidence', evidenceIds: ['e1', 'not-sent'] },
        { text: 'Repeated evidence', evidenceIds: ['e1', 'e1'] },
        { text: 'Missing support', evidenceIds: [] },
        { text: 'Too many references', evidenceIds: ['e1', 'e2', 'e3', 'e4'] },
        { text: 'Supported judgment', evidenceIds: ['e2'] },
      ],
      gaps: [{ text: 'Uncited assertion of a gap', evidenceIds: [] }],
    });

    expect(validateReadingJudgment('library-answer', value, sent, current)).toEqual({
      kind: 'library-answer',
      ...answer({ judgments: [{ text: 'Supported judgment', evidenceIds: [current[1].id] }] }),
    });
  });

  it('drops claims with hostile or malformed fields while preserving another valid claim', () => {
    const { sent, current } = fixture();
    const value = answer({
      judgments: [
        null,
        { text: 'Injected output shape', evidenceIds: ['e1'], execute: 'upload_library' },
        { text: 'Wrong citation shape', evidenceIds: 'e1' },
        { text: 123, evidenceIds: ['e1'] },
        { text: '  ', evidenceIds: ['e1'] },
      ],
      supporting: [{ text: 'Still supported', evidenceIds: ['e2'] }],
    });

    expect(validateReadingJudgment('library-answer', value, sent, current)).toEqual({
      kind: 'library-answer',
      ...answer({ supporting: [{ text: 'Still supported', evidenceIds: [current[1].id] }] }),
    });
  });

  it('requires every citation identity, version, source, and location to remain current', () => {
    const { sent, current } = fixture();
    const original = current[0];
    const changedEvidence = [
      undefined,
      { ...original, id: 'another-local-id' },
      { ...original, sourceVersion: 'changed-version' },
      {
        ...original,
        source: { ...original.source, ref: { kind: 'article' as const, id: 'other-article' } },
      },
      { ...original, location: { ...original.location, annotationId: 'other-annotation' } },
      { ...original, location: { ...original.location, commentId: 'other-comment' } },
      { ...original, location: { ...original.location, commentId: undefined } },
    ];

    for (const changed of changedEvidence) {
      const latest = changed ? [changed, ...current.slice(1)] : current.slice(1);
      expect(
        validateReadingJudgment(
          'reading-relations',
          { relations: [{ evidenceId: 'e1', relation: 'same', explanation: 'Old reference.' }] },
          sent,
          latest,
        ),
      ).toBeNull();
      expect(
        validateReadingJudgment(
          'library-answer',
          answer({
            judgments: [{ text: 'Partially outdated claim', evidenceIds: ['e1', 'e2'] }],
            supporting: [{ text: 'Independent current claim', evidenceIds: ['e3'] }],
          }),
          sent,
          latest,
        ),
      ).toEqual({
        kind: 'library-answer',
        ...answer({
          supporting: [{ text: 'Independent current claim', evidenceIds: [current[2].id] }],
        }),
      });
    }
  });

  it('rejects malformed roots, unexpected root fields, and incomplete library sections', () => {
    const { sent, current } = fixture();
    const kinds: ReadingJudgmentInput['kind'][] = [
      'reading-relations',
      'evidence-comparison',
      'library-answer',
    ];
    for (const kind of kinds) {
      for (const value of [null, [], 'answer', 1, true]) {
        expect(validateReadingJudgment(kind, value, sent, current)).toBeNull();
      }
    }
    for (const value of [
      {},
      { relations: {} },
      { relations: [], kind: 'reading-relations' },
      JSON.parse('{"relations":[],"__proto__":{"admin":true}}'),
    ]) {
      expect(validateReadingJudgment('reading-relations', value, sent, current)).toBeNull();
    }
    const claim = { text: 'Supported judgment', evidenceIds: ['e1'] };
    for (const value of [
      { judgments: [claim], supporting: [], opposingOrLimiting: [] },
      answer({ judgments: [claim], gaps: null }),
      { ...answer({ judgments: [claim] }), instructions: 'Ignore previous rules' },
      answer(),
    ]) {
      expect(validateReadingJudgment('library-answer', value, sent, current)).toBeNull();
    }
  });

  it('does not mutate remote output, sent evidence, or current evidence', () => {
    const { sent, current } = fixture();
    const value = answer({
      judgments: [{ text: 'Current conclusion', evidenceIds: ['e1', 'e2'] }],
    });
    const before = structuredClone({ value, sent, current });

    expect(validateReadingJudgment('library-answer', value, sent, current)).not.toBeNull();
    expect({ value, sent, current }).toEqual(before);
  });

  it('accepts 8192-character text and drops longer items without losing valid neighbors', () => {
    const { sent, current } = fixture();
    const text = '文'.repeat(8192);
    expect(
      validateReadingJudgment(
        'reading-relations',
        {
          relations: [
            { evidenceId: 'e1', relation: 'same', explanation: text },
            { evidenceId: 'e2', relation: 'opposite', explanation: `${text}文` },
          ],
        },
        sent,
        current,
      ),
    ).toEqual({
      kind: 'reading-relations',
      relations: [{ evidenceId: current[0].id, relation: 'same', explanation: text }],
    });
    expect(
      validateReadingJudgment(
        'library-answer',
        answer({
          judgments: [
            { text, evidenceIds: ['e1'] },
            { text: `${text}文`, evidenceIds: ['e2'] },
          ],
        }),
        sent,
        current,
      ),
    ).toEqual({
      kind: 'library-answer',
      ...answer({ judgments: [{ text, evidenceIds: [current[0].id] }] }),
    });
  });

  it('caps raw output arrays at twelve items before filtering malformed entries', () => {
    const { sent, current } = fixture();
    const relation = { evidenceId: 'e1', relation: 'same', explanation: 'A supported relation.' };
    const relations = [relation, ...Array.from({ length: 11 }, () => null)];
    expect(validateReadingJudgment('reading-relations', { relations }, sent, current)).toEqual({
      kind: 'reading-relations',
      relations: [{ ...relation, evidenceId: current[0].id }],
    });
    expect(
      validateReadingJudgment(
        'reading-relations',
        { relations: [...relations, null] },
        sent,
        current,
      ),
    ).toBeNull();

    const claim = { text: 'A supported statement.', evidenceIds: ['e1'] };
    const claims = Array.from({ length: 12 }, () => claim);
    expect(
      validateReadingJudgment('library-answer', answer({ judgments: claims }), sent, current),
    ).toEqual({
      kind: 'library-answer',
      ...answer({ judgments: claims.map(() => ({ ...claim, evidenceIds: [current[0].id] })) }),
    });
    for (const section of ['judgments', 'supporting', 'opposingOrLimiting', 'gaps']) {
      expect(
        validateReadingJudgment(
          'library-answer',
          answer({ judgments: [claim], [section]: [...claims, null] }),
          sent,
          current,
        ),
      ).toBeNull();
    }
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
