import type { ReadingEvidence } from '@yomitomo/shared';

export function rankReadingEvidenceCandidates(
  candidates: readonly ReadingEvidence[],
  limit: number,
): ReadingEvidence[] {
  const requestedLimit = normalizedLimit(limit);
  if (requestedLimit === 0) return [];

  const uniqueCandidates = uniqueByEvidenceId(candidates);
  const resultLimit = Math.min(requestedLimit, uniqueCandidates.length);
  const orderedCandidates = [
    ...uniqueCandidates.filter((candidate) => candidate.role === 'judgment'),
    ...uniqueCandidates.filter((candidate) => candidate.role === 'source'),
  ];
  const perArticleLimit = Math.max(2, Math.ceil(requestedLimit / 3));
  const articleCounts = new Map<string, number>();
  const selected: ReadingEvidence[] = [];
  const deferred: ReadingEvidence[] = [];

  for (const candidate of orderedCandidates) {
    const articleId = candidate.source.ref.id;
    const count = articleCounts.get(articleId) || 0;
    if (count >= perArticleLimit) {
      deferred.push(candidate);
      continue;
    }
    articleCounts.set(articleId, count + 1);
    selected.push(candidate);
  }

  return [...selected, ...deferred].slice(0, resultLimit);
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
