import type { Annotation } from '@yomitomo/shared';
import { rangeDistance } from '@yomitomo/core';
import type { AnnotationSuggestionDedupeMode } from './annotation-generation-types';

export function createAnnotationSuggestionDeduper(
  mode: AnnotationSuggestionDedupeMode,
  articleText: string,
  existingAnnotations: Annotation[],
) {
  if (mode === 'none') return { accept: () => true };
  if (mode === 'thought') return createThoughtAnnotationDeduper(articleText, existingAnnotations);
  return createSegmentAnnotationDeduper(articleText, existingAnnotations);
}

function createThoughtAnnotationDeduper(articleText: string, existingAnnotations: Annotation[]) {
  const accepted = existingAnnotations.flatMap((annotation) => {
    const item = thoughtAnnotationDedupItem(articleText, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = thoughtAnnotationDedupItem(articleText, annotation);
      if (!item) return true;
      if (accepted.some((existing) => thoughtAnnotationDedupItemsMatch(existing, item))) {
        return false;
      }
      accepted.push(item);
      return true;
    },
  };
}

type ThoughtAnnotationDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  comments: string[];
};

function thoughtAnnotationDedupItem(
  articleText: string,
  annotation: Annotation,
): ThoughtAnnotationDedupItem | null {
  const textStart =
    integerAnnotationValue(annotation.anchor.textStartInBook) ??
    integerAnnotationValue(annotation.anchor.start);
  const textEnd =
    integerAnnotationValue(annotation.anchor.textEndInBook) ??
    integerAnnotationValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;

  const comments = annotation.comments
    .map((comment) => normalizeThoughtText(comment.content))
    .filter((comment) => comment.length >= 12);
  return {
    exactKey: normalizeThoughtText(
      annotation.anchor.exact || articleText.slice(textStart, textEnd),
    ),
    textStart,
    textEnd,
    comments,
  };
}

function thoughtAnnotationDedupItemsMatch(
  left: ThoughtAnnotationDedupItem,
  right: ThoughtAnnotationDedupItem,
) {
  if (!sameThoughtAnnotationAnchor(left, right)) return false;
  if (left.comments.length === 0 || right.comments.length === 0) {
    return left.exactKey === right.exactKey;
  }
  return left.comments.some((leftComment) =>
    right.comments.some((rightComment) => thoughtTextsSimilar(leftComment, rightComment)),
  );
}

function sameThoughtAnnotationAnchor(
  left: Pick<ThoughtAnnotationDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
  right: Pick<ThoughtAnnotationDedupItem, 'exactKey' | 'textStart' | 'textEnd'>,
) {
  if (left.exactKey && left.exactKey === right.exactKey) return true;
  return rangeDistance(left, right) <= 16;
}

function thoughtTextsSimilar(left: string, right: string) {
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length >= 24 && longer.includes(shorter)) return true;
  return diceCoefficient(characterBigrams(left), characterBigrams(right)) >= 0.58;
}

function characterBigrams(text: string) {
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function diceCoefficient(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  let overlap = 0;
  for (const item of left) {
    if (right.has(item)) overlap += 1;
  }
  return (2 * overlap) / (left.size + right.size);
}

function normalizeThoughtText(text: string) {
  return text.replace(/[\s"'“”‘’`，。！？、；：,.!?;:—\-（）()[\]{}]/g, '').toLowerCase();
}

function createSegmentAnnotationDeduper(articleText: string, existingAnnotations: Annotation[]) {
  const accepted = existingAnnotations.flatMap((annotation) => {
    const item = segmentAnnotationDedupItem(articleText, annotation);
    return item ? [item] : [];
  });

  return {
    accept(annotation: Annotation) {
      const item = segmentAnnotationDedupItem(articleText, annotation);
      if (!item) return true;
      if (accepted.some((existing) => segmentAnnotationDedupItemsMatch(existing, item))) {
        return false;
      }
      accepted.push(item);
      return true;
    },
  };
}

type SegmentAnnotationDedupItem = {
  exactKey: string;
  textStart: number;
  textEnd: number;
  chapterId?: string;
  segmentId?: string;
  moveType?: string;
};

function segmentAnnotationDedupItem(
  articleText: string,
  annotation: Annotation,
): SegmentAnnotationDedupItem | null {
  const textStart =
    integerAnnotationValue(annotation.anchor.textStartInBook) ??
    integerAnnotationValue(annotation.anchor.start);
  const textEnd =
    integerAnnotationValue(annotation.anchor.textEndInBook) ??
    integerAnnotationValue(annotation.anchor.end);
  if (textStart === null || textEnd === null || textEnd <= textStart) return null;
  return {
    exactKey: normalizeSegmentDedupText(
      annotation.anchor.exact || articleText.slice(textStart, textEnd),
    ),
    textStart,
    textEnd,
    chapterId: annotation.anchor.chapterId,
    segmentId: annotation.anchor.segmentId,
    moveType: annotation.moveType,
  };
}

function segmentAnnotationDedupItemsMatch(
  left: SegmentAnnotationDedupItem,
  right: SegmentAnnotationDedupItem,
) {
  const sameSegment = left.segmentId && right.segmentId && left.segmentId === right.segmentId;
  const sameChapter = left.chapterId && right.chapterId && left.chapterId === right.chapterId;
  const distance = rangeDistance(left, right);
  if (
    left.exactKey &&
    left.exactKey === right.exactKey &&
    (sameSegment || sameChapter || distance <= 2400)
  ) {
    return true;
  }
  if (left.moveType && right.moveType && left.moveType === right.moveType) {
    return Boolean(sameSegment) || distance <= 240;
  }
  return false;
}

function normalizeSegmentDedupText(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function integerAnnotationValue(value: number | undefined): number | null {
  return Number.isInteger(value) && value !== undefined ? value : null;
}
