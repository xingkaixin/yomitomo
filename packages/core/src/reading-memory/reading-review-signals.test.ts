import { describe, expect, it } from 'vitest';
import {
  deriveReadingReviewSignals,
  rankReadingReviewCandidates,
  readingReviewSignalLimits,
  type ReadingReviewSignalCandidate,
  type ReadingReviewSignalVector,
} from './reading-review-signals';

const now = new Date('2026-08-30T12:00:00.000Z');
const dayMs = 24 * 60 * 60 * 1_000;
const before = (days: number) => new Date(now.getTime() - days * dayMs).toISOString();

function vector(
  id: string,
  days: number,
  values = [1, 0],
  targetId = id,
): ReadingReviewSignalVector {
  return { id, targetId, sourceCreatedAt: before(days), vector: new Float32Array(values) };
}

function candidate(id = 'candidate', lastReviewedAt?: string): ReadingReviewSignalCandidate {
  return { id, targetId: id, sourceCreatedAt: before(90), lastReviewedAt };
}

describe('reading review semantic signals', () => {
  it('keeps recent and newer similarities continuous and excludes the same asset or annotation', () => {
    const result = deriveReadingReviewSignals({
      candidates: [candidate('candidate', before(25))],
      candidateVectors: [vector('candidate', 90)],
      recentEvidence: [
        vector('candidate', 1),
        vector('same-thread', 1, [1, 0], 'candidate'),
        vector('recent', 7, [0.25, Math.sqrt(1 - 0.25 ** 2)]),
        vector('newer', 20, [0.6, 0.8]),
        vector('unrelated', 1, [-1, 0]),
      ],
      now,
    });

    expect(result.get('candidate')?.recentSimilarity).toBeCloseTo(0.25);
    expect(result.get('candidate')?.newerSimilarity).toBeCloseTo(0.6);
  });

  it('uses exact time windows, excludes future or invalid evidence, and requires strictly newer evidence', () => {
    const input = {
      candidates: [candidate('candidate', before(7))],
      candidateVectors: [vector('candidate', 90)],
      recentEvidence: [
        vector('at-review', 7, [0.6, 0.8]),
        vector('before-window', 30 + 1 / dayMs),
        vector('future', -1),
        { ...vector('invalid', 1), sourceCreatedAt: 'invalid' },
      ],
      now,
    };
    expect(deriveReadingReviewSignals(input).get('candidate')).toEqual({
      recentSimilarity: expect.closeTo(0.6),
      newerSimilarity: 0,
    });

    expect(
      deriveReadingReviewSignals({
        ...input,
        candidates: [candidate()],
        recentEvidence: [vector('at-window', 30, [0.6, 0.8])],
      }).get('candidate'),
    ).toEqual({ recentSimilarity: 0, newerSimilarity: expect.closeTo(0.6) });
  });

  it('omits unavailable candidate vectors and ignores unusable evidence without inventing a fallback', () => {
    const candidates = ['missing', 'zero', 'non-finite', 'wrong-thread', 'valid'].map((id) =>
      candidate(id),
    );
    const candidateVectors = [
      vector('zero', 90, [0, 0]),
      vector('non-finite', 90, [NaN, 1]),
      vector('wrong-thread', 90, [1, 0], 'different'),
      vector('valid', 90),
    ];
    const recentEvidence = [
      vector('empty', 1, []),
      vector('zero-evidence', 1, [0, 0]),
      vector('non-finite-evidence', 1, [Infinity, 1]),
      vector('wrong-dimension', 1, [1, 0, 0]),
    ];

    expect(
      deriveReadingReviewSignals({ candidates, candidateVectors, recentEvidence, now }),
    ).toEqual(new Map([['valid', { recentSimilarity: 0, newerSimilarity: 0 }]]));
    expect(
      deriveReadingReviewSignals({ candidates, candidateVectors: [], recentEvidence, now }).size,
    ).toBe(0);
    expect(() =>
      deriveReadingReviewSignals({
        candidates,
        candidateVectors,
        recentEvidence,
        now: new Date(NaN),
      }),
    ).toThrow('Invalid reading review signal date');
  });

  it('bounds comparisons to 64 candidates and the newest 128 evidence rows without mutating input', () => {
    const candidates = Array.from({ length: 65 }, (_, index) => candidate(`candidate-${index}`));
    const candidateVectors = candidates.map((item) => vector(item.id, 90));
    const recentEvidence = [
      vector('oldest', 2),
      ...Array.from({ length: 128 }, (_, index) => vector(`recent-${index}`, 1, [0.6, 0.8])),
    ];
    const inputOrder = recentEvidence.map((entry) => entry.id);
    const result = deriveReadingReviewSignals({
      candidates,
      candidateVectors,
      recentEvidence,
      now,
    });

    expect(result.size).toBe(readingReviewSignalLimits.candidateCount);
    expect(result.has('candidate-64')).toBe(false);
    expect(result.get('candidate-0')).toEqual({
      recentSimilarity: expect.closeTo(0.6),
      newerSimilarity: expect.closeTo(0.6),
    });
    expect(recentEvidence.map((entry) => entry.id)).toEqual(inputOrder);
    expect(Array.from(candidateVectors[0].vector)).toEqual([1, 0]);
  });
});

describe('reading review candidate ranking', () => {
  it('limits semantic advancement to seven days so distinctly older judgments keep priority', () => {
    const older = candidate('older', before(20));
    const newer = candidate('newer', before(12));
    const signals = new Map([
      ['newer', { recentSimilarity: 10, newerSimilarity: 10 }],
      ['older', { recentSimilarity: NaN, newerSimilarity: -1 }],
    ]);

    expect(rankReadingReviewCandidates([newer, older], signals)).toEqual([older, newer]);
    expect(
      rankReadingReviewCandidates([older, candidate('newer', before(15))], signals)[0].id,
    ).toBe('newer');
  });

  it('breaks adjusted ties by original due date then locale-independent identifiers', () => {
    const oldest = candidate('z', before(20));
    const sameAge = candidate('a', before(20));
    const later = candidate('0', before(13));
    const result = rankReadingReviewCandidates(
      [later, oldest, sameAge],
      new Map([['0', { recentSimilarity: 1, newerSimilarity: 1 }]]),
    );

    expect(result).toEqual([sameAge, oldest, later]);
    expect(result[0]).toBe(sameAge);
  });

  it('uses only valid formation or last-review dates without a model and respects the shortlist bound', () => {
    const unreviewed = candidate('unreviewed');
    const reviewed = candidate('reviewed', before(1));
    const invalid = candidate('invalid', 'invalid');
    const invalidFormation = { ...candidate('invalid-formation'), sourceCreatedAt: '' };
    expect(
      rankReadingReviewCandidates([reviewed, invalid, unreviewed, invalidFormation], new Map()),
    ).toEqual([unreviewed, reviewed]);
    expect(
      rankReadingReviewCandidates(
        Array.from({ length: 65 }, (_, index) => candidate(`candidate-${index}`)),
        new Map(),
      ),
    ).toHaveLength(64);
  });
});
