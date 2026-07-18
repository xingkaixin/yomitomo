import type { Annotation, Comment } from '@yomitomo/shared';
import {
  intersectTextRanges,
  type ReadingContextBundle,
  type ReadingContextTextRange,
} from '@yomitomo/core';

export function annotationAuthorLabel(annotation: Annotation) {
  if (annotation.author === 'ai') {
    return annotation.agentNickname || annotation.agentUsername || 'AI';
  }
  return annotation.userNickname || annotation.userUsername || '读者';
}

export function commentAuthorLabel(comment: Comment) {
  if (comment.author === 'ai') {
    return comment.agentNickname || comment.agentUsername || 'AI';
  }
  return comment.userNickname || comment.userUsername || '读者';
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
