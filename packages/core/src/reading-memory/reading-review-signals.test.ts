import { describe, expect, it } from 'vitest';
import {
  deriveReadingReviewSignals,
  rankReadingReviewCandidates,
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
});
