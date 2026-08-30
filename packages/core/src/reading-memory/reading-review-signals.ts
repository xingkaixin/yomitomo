export const readingReviewSignalLimits = {
  candidateCount: 64,
  recentEvidenceCount: 128,
  evidenceWindowDays: 30,
  recentWindowDays: 7,
} as const;

export type ReadingReviewSignalCandidate = {
  id: string;
  targetId: string;
  sourceCreatedAt: string;
  lastReviewedAt?: string;
};

export type ReadingReviewSignalVector = {
  id: string;
  targetId: string;
  sourceCreatedAt: string;
  vector: Float32Array;
};

export type ReadingReviewSignals = {
  recentSimilarity: number;
  newerSimilarity: number;
};

const dayMs = 24 * 60 * 60 * 1_000;

export function deriveReadingReviewSignals(input: {
  candidates: readonly ReadingReviewSignalCandidate[];
  candidateVectors: readonly ReadingReviewSignalVector[];
  recentEvidence: readonly ReadingReviewSignalVector[];
  now: Date;
}): Map<string, ReadingReviewSignals> {
  const now = input.now.getTime();
  if (!Number.isFinite(now)) throw new Error('Invalid reading review signal date');
  const recentCutoff = now - readingReviewSignalLimits.recentWindowDays * dayMs;
  const evidenceCutoff = now - readingReviewSignalLimits.evidenceWindowDays * dayMs;
  const candidates = input.candidates.slice(0, readingReviewSignalLimits.candidateCount);
  const candidateVectors = new Map(
    input.candidateVectors
      .slice(0, readingReviewSignalLimits.candidateCount)
      .map((entry) => [entry.id, measuredVector(entry)] as const),
  );
  const recentEvidence = input.recentEvidence
    .map((entry) => ({ entry, createdAt: Date.parse(entry.sourceCreatedAt) }))
    .filter(({ createdAt }) => createdAt >= evidenceCutoff && createdAt <= now)
    .toSorted(
      (left, right) =>
        right.createdAt - left.createdAt || compareIds(left.entry.id, right.entry.id),
    )
    .slice(0, readingReviewSignalLimits.recentEvidenceCount)
    .flatMap(({ entry, createdAt }) => {
      const measured = measuredVector(entry);
      return measured ? [{ ...measured, createdAt }] : [];
    });
  const result = new Map<string, ReadingReviewSignals>();

  for (const candidate of candidates) {
    const vector = candidateVectors.get(candidate.id);
    const reviewedAt = Date.parse(candidate.lastReviewedAt ?? candidate.sourceCreatedAt);
    if (!vector || vector.entry.targetId !== candidate.targetId || !Number.isFinite(reviewedAt)) {
      continue;
    }
    let recentSimilarity = 0;
    let newerSimilarity = 0;
    for (const evidence of recentEvidence) {
      if (
        evidence.entry.id === candidate.id ||
        evidence.entry.targetId === candidate.targetId ||
        evidence.entry.vector.length !== vector.entry.vector.length ||
        (evidence.createdAt < recentCutoff && evidence.createdAt <= reviewedAt)
      ) {
        continue;
      }
      let dot = 0;
      for (let index = 0; index < vector.entry.vector.length; index += 1) {
        dot += vector.entry.vector[index] * evidence.entry.vector[index];
      }
      const similarity = Math.max(0, Math.min(1, dot / (vector.norm * evidence.norm)));
      if (evidence.createdAt >= recentCutoff) {
        recentSimilarity = Math.max(recentSimilarity, similarity);
      }
      if (evidence.createdAt > reviewedAt) {
        newerSimilarity = Math.max(newerSimilarity, similarity);
      }
    }
    result.set(candidate.id, { recentSimilarity, newerSimilarity });
  }
  return result;
}

export function rankReadingReviewCandidates<T extends ReadingReviewSignalCandidate>(
  candidates: readonly T[],
  signals: ReadonlyMap<string, ReadingReviewSignals>,
): T[] {
  return candidates
    .slice(0, readingReviewSignalLimits.candidateCount)
    .flatMap((candidate) => {
      const due = Date.parse(candidate.lastReviewedAt ?? candidate.sourceCreatedAt);
      if (!Number.isFinite(due)) return [];
      const signal = signals.get(candidate.id);
      const weight = signal
        ? (boundedScore(signal.recentSimilarity) + boundedScore(signal.newerSimilarity)) / 2
        : 0;
      // Keep time priority with a bounded advance, not a calibrated probability.
      const adjustedDue = due - weight * readingReviewSignalLimits.recentWindowDays * dayMs;
      return [{ candidate, due, adjustedDue }];
    })
    .toSorted(
      (left, right) =>
        left.adjustedDue - right.adjustedDue ||
        left.due - right.due ||
        compareIds(left.candidate.id, right.candidate.id),
    )
    .map(({ candidate }) => candidate);
}

function boundedScore(score: number) {
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0;
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function measuredVector(entry: ReadingReviewSignalVector) {
  let squaredNorm = 0;
  for (const value of entry.vector) {
    if (!Number.isFinite(value)) return null;
    squaredNorm += value * value;
  }
  if (!Number.isFinite(squaredNorm) || squaredNorm <= 0) return null;
  return { entry, norm: Math.sqrt(squaredNorm) };
}
