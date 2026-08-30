import type { ReadingEvidence } from '@yomitomo/shared';

const candidateLimitPerRoute = 40;
const mergedCandidateLimit = 24;

export function rankReadingEvidenceCandidates(
  candidates: readonly ReadingEvidence[],
  limit: number,
): ReadingEvidence[] {
  const requestedLimit = normalizedLimit(limit);
  if (requestedLimit === 0) return [];

  const uniqueCandidates = uniqueByEvidenceId(candidates);
  const prioritizedCandidates = uniqueCandidates.filter(
    (candidate) => candidate.review?.decision !== 'need_evidence',
  );
  const orderedCandidates = [
    ...prioritizedCandidates.filter((candidate) => candidate.role === 'judgment'),
    ...prioritizedCandidates.filter((candidate) => candidate.role === 'source'),
  ];
  return selectDiverseCandidates(
    [
      orderedCandidates,
      uniqueCandidates.filter((candidate) => candidate.review?.decision === 'need_evidence'),
    ],
    requestedLimit,
  );
}

export function mergeReadingEvidenceCandidates(
  keywordEvidence: readonly ReadingEvidence[],
  semanticEvidence: readonly ReadingEvidence[],
  limit: number,
): ReadingEvidence[] {
  const requestedLimit = Math.min(normalizedLimit(limit), mergedCandidateLimit);
  if (requestedLimit === 0) return [];

  const candidates = new Map<string, { evidence: ReadingEvidence; score: number }>();
  for (const route of [keywordEvidence, semanticEvidence]) {
    const uniqueCandidates = uniqueByEvidenceId(route.slice(0, candidateLimitPerRoute));
    for (const [index, evidence] of uniqueCandidates.entries()) {
      // The route bound makes two-route agreement outrank one-route hits without mixing score scales.
      const score = 1 / (candidateLimitPerRoute + index + 1);
      const candidate = candidates.get(evidence.id);
      if (candidate) candidate.score += score;
      else candidates.set(evidence.id, { evidence, score });
    }
  }

  const orderedCandidates = [...candidates.values()]
    .toSorted((left, right) => right.score - left.score)
    .map((candidate) => candidate.evidence);
  return selectDiverseCandidates(
    [
      orderedCandidates.filter(
        (candidate) =>
          candidate.role === 'judgment' && candidate.review?.decision !== 'need_evidence',
      ),
      orderedCandidates.filter(
        (candidate) =>
          candidate.role === 'source' && candidate.review?.decision !== 'need_evidence',
      ),
      orderedCandidates.filter((candidate) => candidate.review?.decision === 'need_evidence'),
    ],
    requestedLimit,
  );
}

function selectDiverseCandidates(groups: readonly (readonly ReadingEvidence[])[], limit: number) {
  const perArticleLimit = Math.max(2, Math.ceil(limit / 3));
  const articleCounts = new Map<string, number>();
  const selected: ReadingEvidence[] = [];

  for (const candidates of groups) {
    const deferred: ReadingEvidence[] = [];
    for (const candidate of candidates) {
      const articleId = candidate.source.ref.id;
      const count = articleCounts.get(articleId) || 0;
      if (count >= perArticleLimit) {
        deferred.push(candidate);
        continue;
      }
      articleCounts.set(articleId, count + 1);
      selected.push(candidate);
    }
    for (const candidate of deferred) {
      const articleId = candidate.source.ref.id;
      articleCounts.set(articleId, (articleCounts.get(articleId) || 0) + 1);
      selected.push(candidate);
    }
  }

  return selected.slice(0, limit);
}

function uniqueByEvidenceId(candidates: readonly ReadingEvidence[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.id)) return false;
    seen.add(candidate.id);
    return true;
  });
}

function normalizedLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.floor(limit);
}
