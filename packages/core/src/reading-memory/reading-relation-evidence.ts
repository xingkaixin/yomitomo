import {
  isPdfTextAnchor,
  type ReaderQuestionContext,
  type ReadingEvidence,
  type TextAnchor,
} from '@yomitomo/shared';
import { rankReadingEvidenceCandidates } from './reading-evidence-ranking';

export function selectReadingRelationEvidence(
  candidates: readonly ReadingEvidence[],
  current: { articleId: string; context: ReaderQuestionContext },
): ReadingEvidence[] {
  const seenIds = new Set<string>();
  const representatives = new Map<string, ReadingEvidence>();

  for (const candidate of candidates) {
    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);
    if (isCurrentSelectionEvidence(candidate, current)) continue;

    const content = normalizeText(candidate.content);
    if (!content) continue;
    // A shared quote can carry distinct or opposing judgments; both texts must match.
    const key = JSON.stringify([content, normalizeText(candidate.location.anchor.exact)]);
    const previous = representatives.get(key);
    if (!previous || preferRepresentative(candidate, previous, current.articleId)) {
      representatives.set(key, candidate);
    }
  }

  return rankReadingEvidenceCandidates([...representatives.values()], 3);
}

function preferRepresentative(
  candidate: ReadingEvidence,
  previous: ReadingEvidence,
  articleId: string,
) {
  const candidateIsUserJudgment = candidate.role === 'judgment' && candidate.authorKind === 'user';
  const previousIsUserJudgment = previous.role === 'judgment' && previous.authorKind === 'user';
  if (candidateIsUserJudgment !== previousIsUserJudgment) return candidateIsUserJudgment;
  return previous.source.ref.id === articleId && candidate.source.ref.id !== articleId;
}

function isCurrentSelectionEvidence(
  evidence: ReadingEvidence,
  current: { articleId: string; context: ReaderQuestionContext },
) {
  const selection = current.context.anchor;
  if (evidence.source.ref.id !== current.articleId || !selection) return false;
  const anchor = evidence.location.anchor;
  if (!shareCoordinateSpace(anchor, selection, current.context.sourceType)) return false;

  const evidenceRange = anchorRange(anchor, current.context.sourceType);
  const selectionRange = anchorRange(selection, current.context.sourceType);
  if (
    isValidRange(evidenceRange) &&
    isValidRange(selectionRange) &&
    evidenceRange.start < selectionRange.end &&
    selectionRange.start < evidenceRange.end
  ) {
    return true;
  }

  return (
    evidence.role === 'source' &&
    Boolean(anchor.paragraphId) &&
    anchor.paragraphId === selection.paragraphId &&
    normalizeText(anchor.exact) === normalizeText(current.context.quote)
  );
}

function shareCoordinateSpace(
  left: TextAnchor,
  right: TextAnchor,
  sourceType: ReaderQuestionContext['sourceType'],
) {
  if (isPdfTextAnchor(left) || isPdfTextAnchor(right)) {
    return isPdfTextAnchor(left) && isPdfTextAnchor(right) && left.pageIndex === right.pageIndex;
  }
  if (sourceType === 'pdf') return false;
  if (sourceType === 'ebook') {
    return !left.chapterId || !right.chapterId || left.chapterId === right.chapterId;
  }
  // Web translation offsets belong to one translated block, not to the original article.
  return left.segmentId === right.segmentId;
}

function anchorRange(anchor: TextAnchor, sourceType: ReaderQuestionContext['sourceType']) {
  if (
    sourceType === 'ebook' &&
    anchor.textStartInBook !== undefined &&
    anchor.textEndInBook !== undefined
  ) {
    return { start: anchor.textStartInBook, end: anchor.textEndInBook };
  }
  return anchor;
}

function isValidRange(range: { start: number; end: number }) {
  return (
    Number.isSafeInteger(range.start) &&
    Number.isSafeInteger(range.end) &&
    range.start >= 0 &&
    range.start < range.end
  );
}

function normalizeText(text: string) {
  return text.normalize('NFC').replace(/\s+/g, ' ').trim();
}
