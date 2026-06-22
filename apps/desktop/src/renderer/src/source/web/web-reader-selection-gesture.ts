import {
  isRangeInsideArticle,
  offsetFromArticleStartIgnoringSelector,
  rangeFromOffsetsIgnoringSelector,
  translationElementForRange,
} from '@yomitomo/core';

const ignoredTranslationSelector = '[data-reader-translation]';
const minimumSelectionGestureDistancePx = 4;
const nativeEndpointToleranceChars = 64;
const nativeExtraLengthToleranceChars = 512;
const nativeLengthMultiplierTolerance = 3;

type CaretPositionLike = {
  offsetNode: Node;
  offset: number;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionLike | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export type WebSelectionGesturePoint = {
  clientX: number;
  clientY: number;
  sourceOffset: number;
  translationBlockId: string | null;
};

export type WebSelectionGestureRange = {
  range: Range;
  startOffset: number;
  endOffset: number;
  startPoint: WebSelectionGesturePoint;
  endPoint: WebSelectionGesturePoint;
};

export function webSelectionGesturePointFromClientPoint(
  articleElement: HTMLElement,
  clientX: number,
  clientY: number,
): WebSelectionGesturePoint | null {
  const range = caretRangeFromClientPoint(articleElement.ownerDocument, clientX, clientY);
  if (!range || !articleElement.contains(range.startContainer)) return null;

  const sourceOffset = sourceOffsetFromArticleStartIgnoringSelector(
    articleElement,
    range.startContainer,
    range.startOffset,
  );
  if (!Number.isFinite(sourceOffset)) return null;

  return {
    clientX,
    clientY,
    sourceOffset,
    translationBlockId:
      translationElementForRange(range)?.getAttribute('data-reader-translation-block-id') ?? null,
  };
}

export function webSelectionGestureRangeFromClientPoint(
  articleElement: HTMLElement,
  startPoint: WebSelectionGesturePoint | null,
  clientX: number,
  clientY: number,
): WebSelectionGestureRange | null {
  if (!startPoint) return null;
  if (selectionGestureDistance(startPoint, clientX, clientY) < minimumSelectionGestureDistancePx) {
    return null;
  }

  const endPoint = webSelectionGesturePointFromClientPoint(articleElement, clientX, clientY);
  if (!endPoint || startPoint.translationBlockId || endPoint.translationBlockId) return null;

  const startOffset = Math.min(startPoint.sourceOffset, endPoint.sourceOffset);
  const endOffset = Math.max(startPoint.sourceOffset, endPoint.sourceOffset);
  if (startOffset === endOffset) return null;

  const range = rangeFromOffsetsIgnoringSelector(
    articleElement,
    startOffset,
    endOffset,
    ignoredTranslationSelector,
  );
  if (!range || range.collapsed) return null;

  return { range, startOffset, endOffset, startPoint, endPoint };
}

export function shouldUseWebSelectionGestureRange(
  nativeRange: Range,
  articleElement: HTMLElement,
  startPoint: WebSelectionGesturePoint,
  gestureRange: WebSelectionGestureRange,
) {
  if (nativeRange.collapsed) return true;
  if (!isRangeInsideArticle(nativeRange, articleElement)) return true;

  const nativeStart = sourceOffsetFromArticleStartIgnoringSelector(
    articleElement,
    nativeRange.startContainer,
    nativeRange.startOffset,
  );
  const nativeEnd = sourceOffsetFromArticleStartIgnoringSelector(
    articleElement,
    nativeRange.endContainer,
    nativeRange.endOffset,
  );

  return shouldPreferWebSelectionGestureRange({
    gestureStartOffset: startPoint.sourceOffset,
    nativeStart,
    nativeEnd,
    pointerStart: gestureRange.startOffset,
    pointerEnd: gestureRange.endOffset,
  });
}

export function shouldPreferWebSelectionGestureRange({
  gestureStartOffset,
  nativeStart,
  nativeEnd,
  pointerStart,
  pointerEnd,
}: {
  gestureStartOffset: number;
  nativeStart: number;
  nativeEnd: number;
  pointerStart: number;
  pointerEnd: number;
}) {
  const nativeLength = Math.abs(nativeEnd - nativeStart);
  const pointerLength = Math.abs(pointerEnd - pointerStart);
  const nativeStartsAtGesture =
    Math.min(
      Math.abs(nativeStart - gestureStartOffset),
      Math.abs(nativeEnd - gestureStartOffset),
    ) <= nativeEndpointToleranceChars;

  return (
    !nativeStartsAtGesture &&
    nativeLength > pointerLength + nativeExtraLengthToleranceChars &&
    nativeLength > pointerLength * nativeLengthMultiplierTolerance
  );
}

function caretRangeFromClientPoint(ownerDocument: Document, clientX: number, clientY: number) {
  const caretDocument = ownerDocument as CaretDocument;
  const caretPosition = caretDocument.caretPositionFromPoint?.(clientX, clientY);
  if (caretPosition) {
    const range = ownerDocument.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
    return range;
  }

  const caretRange = caretDocument.caretRangeFromPoint?.(clientX, clientY);
  return caretRange?.cloneRange() ?? null;
}

function sourceOffsetFromArticleStartIgnoringSelector(
  articleElement: HTMLElement,
  node: Node,
  offset: number,
) {
  if (node.nodeType !== Node.TEXT_NODE) {
    return offsetFromArticleStartIgnoringSelector(
      articleElement,
      node,
      offset,
      ignoredTranslationSelector,
    );
  }

  const target = node as Text;
  let currentOffset = 0;
  const walker = articleElement.ownerDocument.createTreeWalker(
    articleElement,
    NodeFilter.SHOW_TEXT,
  );

  while (walker.nextNode()) {
    const current = walker.currentNode as Text;
    if (textNodeIgnored(current)) continue;
    if (current === target) return currentOffset + Math.min(offset, current.data.length);
    currentOffset += current.data.length;
  }

  return offsetFromArticleStartIgnoringSelector(
    articleElement,
    node,
    offset,
    ignoredTranslationSelector,
  );
}

function textNodeIgnored(node: Node) {
  return Boolean(node.parentElement?.closest(ignoredTranslationSelector));
}

function selectionGestureDistance(
  startPoint: WebSelectionGesturePoint,
  clientX: number,
  clientY: number,
) {
  return Math.hypot(clientX - startPoint.clientX, clientY - startPoint.clientY);
}
