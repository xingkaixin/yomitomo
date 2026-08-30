import type { ReadingReviewBase, ReadingReviewEvent, ReadingReviewFold } from '@yomitomo/shared';

export function foldReadingReviews(
  base: ReadingReviewBase,
  events: readonly ReadingReviewEvent[],
  sha256: (text: string) => string,
): ReadingReviewFold {
  const current: ReadingReviewFold = {
    content: base.content,
    ...(base.authorKind === undefined ? {} : { authorKind: base.authorKind }),
    latestReview: null,
  };
  let reviewedAt = Number.NEGATIVE_INFINITY;
  if (!base.content.trim()) return current;

  const byPrevious = new Map<string | null, ReadingReviewEvent | null>();
  const idCounts = new Map<string, number>();
  for (const event of events) {
    if (
      event.articleId !== base.articleId ||
      event.annotationId !== base.annotationId ||
      event.assetType !== base.assetType ||
      event.assetId !== base.assetId ||
      event.assetVersion !== base.assetVersion
    )
      continue;
    idCounts.set(event.id, (idCounts.get(event.id) ?? 0) + 1);
    byPrevious.set(event.previousReviewId, byPrevious.has(event.previousReviewId) ? null : event);
  }

  for (let event = byPrevious.get(null); event; event = byPrevious.get(event.id)) {
    const createdAt = Date.parse(event.createdAt);
    if (
      !event.id ||
      idCounts.get(event.id) !== 1 ||
      !Number.isFinite(createdAt) ||
      createdAt < reviewedAt ||
      event.judgmentSnapshot !== current.content ||
      !/^[a-f0-9]{64}$/.test(event.judgmentDigest) ||
      event.judgmentDigest !== sha256(current.content) ||
      (event.decision !== 'need_evidence' && !event.answer.trim())
    )
      break;
    if (event.decision === 'changed') {
      current.content = event.answer;
      current.authorKind = 'user';
    }
    current.latestReview = { id: event.id, decision: event.decision, createdAt: event.createdAt };
    reviewedAt = createdAt;
  }

  return current;
}
