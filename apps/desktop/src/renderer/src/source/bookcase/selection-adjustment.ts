import type {
  SelectionAdjustmentHandle,
  SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';

export type SelectionAdjustmentBounds = {
  endOffset: number;
  handle: SelectionAdjustmentHandle;
  startOffset: number;
};

export type SelectionAdjustedOffsets = {
  endOffset: number;
  startOffset: number;
};

export function isAdjustableSelectionOffsetRange(startOffset: number, endOffset: number) {
  return Number.isFinite(startOffset) && Number.isFinite(endOffset) && startOffset !== endOffset;
}

export function selectionAdjustmentAdjustedOffsets(
  adjustment: SelectionAdjustmentBounds,
  sourceOffset: number,
): SelectionAdjustedOffsets | null {
  const fixedOffset = adjustment.handle === 'start' ? adjustment.endOffset : adjustment.startOffset;
  const nextStartOffset = Math.min(fixedOffset, sourceOffset);
  const nextEndOffset = Math.max(fixedOffset, sourceOffset);
  if (nextStartOffset === nextEndOffset) return null;
  return { startOffset: nextStartOffset, endOffset: nextEndOffset };
}

export function selectionAdjustmentDraggingHandle(
  adjustment: SelectionAdjustmentBounds,
  sourceOffset: number,
): SelectionAdjustmentHandle {
  const fixedOffset = adjustment.handle === 'start' ? adjustment.endOffset : adjustment.startOffset;
  return sourceOffset < fixedOffset ? 'start' : 'end';
}

export function describeSelectionAdjustmentPoint(point: SelectionAdjustmentPointer) {
  return {
    clientX: Math.round(point.clientX),
    clientY: Math.round(point.clientY),
  };
}
