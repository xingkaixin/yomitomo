import { describe, expect, it } from 'vitest';
import { evaluateReadingMemoryHumanReview } from './reading-memory-human-review-evaluation.ts';

describe('synthetic human retrieval records, not actual release evidence', () => {
  it('scores helpful displayed results and complete necessary sent sets at each direction threshold', () => {
    const record = syntheticRecord();
    const original = structuredClone(record);
    const result = evaluateReadingMemoryHumanReview(record);

    expect(record).toEqual(original);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.directions).toHaveLength(9);
    for (const direction of result.directions) {
      expect(direction).toMatchObject({
        relateQueryCount: 20,
        askQueryCount: 20,
        relateHitAt3: { numerator: 16, denominator: 20, rate: 0.8, minimum: 0.8, passed: true },
        askCompleteNecessaryAt12: {
          numerator: 18,
          denominator: 20,
          rate: 0.9,
          minimum: 0.9,
          passed: true,
        },
      });
    }
    expect(result.cases).toHaveLength(360);
    expect(result.provenanceVerified).toBe(false);
    expect(result).not.toHaveProperty('releaseApproved');
    expect(result.retrievalBasis).toBe('submitted-final-ids-not-production-replay');
    expect(result.notice).toContain('does not verify human authorship or authorize a release');
    for (const privateText of [
      record.retrieval[0].query,
      record.retrieval[0].displayedIds[0],
      record.retrieval[0].helpfulIds[0],
      record.provenance.sourceStatement,
      record.provenance.reviewerId,
    ])
      expect(JSON.stringify(result)).not.toContain(privateText);
  });

  it('fails all twenty ask queries when each final sent set omits one of ten necessary items', () => {
    const record = syntheticRecord();
    const queries = record.retrieval.filter(
      (item) =>
        item.kind === 'ask' && item.queryLanguage === 'zh' && item.evidenceLanguage === 'zh',
    );
    for (const item of queries) {
      item.necessaryIds = Array.from({ length: 10 }, (_, index) => `necessary-${item.id}-${index}`);
      item.displayedIds = [...item.necessaryIds];
      item.sentIds = item.necessaryIds.slice(0, 9);
    }
    const result = evaluateReadingMemoryHumanReview(record);

    expect(queries).toHaveLength(20);
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual(['retrieval.zh->zh.askCompleteNecessaryAt12']);
    expect(result.directions[0].askCompleteNecessaryAt12).toMatchObject({
      numerator: 0,
      denominator: 20,
      rate: 0,
      passed: false,
    });
    expect(
      result.cases.filter((item) => item.direction === 'zh->zh' && item.kind === 'ask'),
    ).toSatisfy((items) => items.every((item) => !item.passed));
  });

  it('fails a missing direction, an undersized kind, or an individual below-threshold direction', () => {
    const missing = syntheticRecord();
    missing.retrieval = missing.retrieval.filter(
      (item) => item.queryLanguage !== 'ja' || item.evidenceLanguage !== 'en',
    );
    const absent = evaluateReadingMemoryHumanReview(missing);
    expect(absent.passed).toBe(false);
    expect(absent.failures).toContain('retrieval.ja->en.relateQueryCount');
    expect(absent.failures).toContain('retrieval.ja->en.askQueryCount');

    const undersized = syntheticRecord();
    undersized.retrieval.splice(19, 1);
    const under = evaluateReadingMemoryHumanReview(undersized);
    expect(under.passed).toBe(false);
    expect(under.failures).toEqual(['retrieval.zh->zh.relateQueryCount']);

    const below = syntheticRecord();
    below.retrieval[0].displayedIds = [];
    const failed = evaluateReadingMemoryHumanReview(below);
    expect(failed.failures).toEqual(['retrieval.zh->zh.relateHitAt3']);
    expect(failed.directions[0].relateHitAt3.rate).toBe(0.75);
  });
});

function syntheticRecord() {
  const languages = ['zh', 'en', 'ja'];
  return {
    schemaVersion: 1,
    evaluationId: 'synthetic-retrieval-unit-test-only',
    systemRevision: '1234567890abcdef1234567890abcdef12345678',
    provenance: {
      source: 'deidentified-real-reading',
      sourceStatement:
        'Synthetic unit-test records only; not real reading or actual human judgments.',
      reviewMethod: 'independent-human',
      reviewerId: 'synthetic-test-only-reviewer',
    },
    retrieval: languages.flatMap((queryLanguage) =>
      languages.flatMap((evidenceLanguage) =>
        ['relate', 'ask'].flatMap((kind) =>
          Array.from({ length: 20 }, (_, index) => {
            const id = `${queryLanguage}-${evidenceLanguage}-${kind}-${index}`;
            const base = {
              id,
              kind,
              queryLanguage,
              evidenceLanguage,
              query: `PRIVATE synthetic question for ${id}`,
            };
            if (kind === 'relate') {
              const helpfulId = `helpful-evidence-${id}`;
              return {
                ...base,
                displayedIds: [
                  index < 16 ? helpfulId : `miss-${id}`,
                  `other-a-${id}`,
                  `other-b-${id}`,
                ],
                sentIds: [],
                helpfulIds: [helpfulId],
              };
            }
            const necessaryIds = [`necessary-a-${id}`, `necessary-b-${id}`];
            return {
              ...base,
              displayedIds: [...necessaryIds],
              sentIds: index < 18 ? [...necessaryIds] : necessaryIds.slice(0, 1),
              necessaryIds,
            };
          }),
        ),
      ),
    ),
  };
}
