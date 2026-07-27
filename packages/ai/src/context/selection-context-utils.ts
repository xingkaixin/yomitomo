import type { Annotation, Comment } from '@yomitomo/shared';
import {
  annotationAuthorName,
  intersectTextRanges,
  type ReadingContextBundle,
  type ReadingContextTextRange,
} from '@yomitomo/core';

export function annotationAuthorLabel(annotation: Annotation) {
  return annotationAuthorName(annotation.author);
}

export function commentAuthorLabel(comment: Comment) {
  return annotationAuthorName(comment.author);
}

export function clippedThreadContextComments(comments: Comment[], recentLimit: number): Comment[] {
  const nonEmpty = comments.filter((comment) => comment.content.trim());
  if (nonEmpty.length <= recentLimit + 1) return nonEmpty;
  const first = nonEmpty[0];
  const recent = nonEmpty.slice(-recentLimit);
  return first && !recent.some((comment) => comment.id === first.id) ? [first, ...recent] : recent;
}

export function rangeAllowed(
  range: ReadingContextTextRange,
  readingContext: ReadingContextBundle | undefined,
) {
  return !readingContext || intersectTextRanges(readingContext.textRanges, range).length > 0;
}

export function clampInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

export function clipText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`;
}
