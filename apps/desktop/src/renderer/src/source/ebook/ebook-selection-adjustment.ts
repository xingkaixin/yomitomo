import type { SelectionAdjustmentHandle } from '@yomitomo/reader-ui/reader-app-view';

type CaretPositionLike = {
  offset: number;
  offsetNode: Node;
};

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionLike | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

export type EbookSelectionAdjustment = {
  doc: Document;
  endOffset: number;
  handle: SelectionAdjustmentHandle;
  sectionIndex: number;
  startOffset: number;
};

export type EbookSelectionAdjustmentPoint = {
  sourceOffset: number;
};

export type EbookSelectionAdjustedOffsets = {
  endOffset: number;
  startOffset: number;
};

export function ebookSelectionAdjustedOffsets({
  endOffset,
  handle,
  sourceOffset,
  startOffset,
}: {
  endOffset: number;
  handle: SelectionAdjustmentHandle;
  sourceOffset: number;
  startOffset: number;
}): EbookSelectionAdjustedOffsets | null {
  const fixedOffset = handle === 'start' ? endOffset : startOffset;
  const nextStartOffset = Math.min(fixedOffset, sourceOffset);
  const nextEndOffset = Math.max(fixedOffset, sourceOffset);
  if (nextStartOffset === nextEndOffset) return null;
  return { startOffset: nextStartOffset, endOffset: nextEndOffset };
}

export function ebookSelectionAdjustmentDraggingHandle(
  adjustment: EbookSelectionAdjustment,
  sourceOffset: number,
): SelectionAdjustmentHandle {
  const fixedOffset = adjustment.handle === 'start' ? adjustment.endOffset : adjustment.startOffset;
  return sourceOffset < fixedOffset ? 'start' : 'end';
}

export function ebookSelectionPointFromClientPoint(
  doc: Document,
  clientX: number,
  clientY: number,
): EbookSelectionAdjustmentPoint | null {
  const frame = doc.defaultView?.frameElement;
  if (!(frame instanceof HTMLIFrameElement)) return null;

  const rect = frame.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
    return null;
  }

  return ebookSelectionPointFromDocumentPoint(doc, clientX - rect.left, clientY - rect.top);
}

export function ebookSelectionPointFromDocumentPoint(
  doc: Document,
  x: number,
  y: number,
): EbookSelectionAdjustmentPoint | null {
  const body = doc.body;
  const range = caretRangeFromDocumentPoint(doc, x, y);
  if (!body || !range || !rootContainsNode(body, range.startContainer)) return null;

  const sourceOffset = ebookOffsetFromDocumentStart(body, range.startContainer, range.startOffset);
  return Number.isFinite(sourceOffset) ? { sourceOffset } : null;
}

export function ebookSelectionRangeOffsets(root: HTMLElement, range: Range) {
  if (
    !rootContainsNode(root, range.startContainer) ||
    !rootContainsNode(root, range.endContainer)
  ) {
    return null;
  }

  const startOffset = ebookOffsetFromDocumentStart(root, range.startContainer, range.startOffset);
  const endOffset = ebookOffsetFromDocumentStart(root, range.endContainer, range.endOffset);
  if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset) || startOffset === endOffset) {
    return null;
  }

  return {
    startOffset: Math.min(startOffset, endOffset),
    endOffset: Math.max(startOffset, endOffset),
  };
}

export function ebookSelectionRangeFromOffsets(
  root: HTMLElement,
  startOffset: number,
  endOffset: number,
) {
  if (startOffset < 0 || endOffset <= startOffset) return null;

  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startNode: Text | null = null;
  let endNode: Text | null = null;
  let rangeStartOffset = 0;
  let rangeEndOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!isTextNode(node)) continue;

    const nextOffset = currentOffset + node.data.length;
    if (!startNode && startOffset >= currentOffset && startOffset < nextOffset) {
      startNode = node;
      rangeStartOffset = startOffset - currentOffset;
    }
    if (!endNode && endOffset >= currentOffset && endOffset <= nextOffset) {
      endNode = node;
      rangeEndOffset = endOffset - currentOffset;
      break;
    }
    currentOffset = nextOffset;
  }

  if (!startNode || !endNode) return null;

  const range = root.ownerDocument.createRange();
  range.setStart(startNode, rangeStartOffset);
  range.setEnd(endNode, rangeEndOffset);
  return range;
}

function ebookOffsetFromDocumentStart(root: HTMLElement, node: Node, offset: number) {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function caretRangeFromDocumentPoint(doc: Document, x: number, y: number) {
  const caretDocument = doc as CaretDocument;
  const caretPosition = caretDocument.caretPositionFromPoint?.(x, y);
  if (caretPosition) {
    const range = doc.createRange();
    range.setStart(caretPosition.offsetNode, caretPosition.offset);
    range.collapse(true);
    return range;
  }

  const caretRange = caretDocument.caretRangeFromPoint?.(x, y);
  return caretRange?.cloneRange() ?? null;
}

function rootContainsNode(root: HTMLElement, node: Node) {
  if (node === root) return true;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentNode;
  return Boolean(element && root.contains(element));
}

function isTextNode(node: Node): node is Text {
  return node.nodeType === Node.TEXT_NODE;
}
