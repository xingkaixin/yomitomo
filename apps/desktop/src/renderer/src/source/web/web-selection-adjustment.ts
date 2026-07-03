import type { Annotation } from '@yomitomo/shared';
import type {
  SelectionAdjustmentHandle,
  SelectionAdjustmentPointer,
} from '@yomitomo/reader-ui/reader-app-view';

type WebSelectionAdjustmentBase = {
  endOffset: number;
  handle: SelectionAdjustmentHandle;
  startOffset: number;
};

export type WebSelectionAdjustment =
  | (WebSelectionAdjustmentBase & {
      kind: 'source';
    })
  | (WebSelectionAdjustmentBase & {
      kind: 'translation';
      translationBlockId: string;
    });

export function describeSelectionAdjustmentPoint(point: SelectionAdjustmentPointer) {
  return {
    clientX: Math.round(point.clientX),
    clientY: Math.round(point.clientY),
  };
}

export function canAdjustWebSelectionAnchor(anchor: Annotation['anchor']) {
  if (!webSelectionAdjustmentKind(anchor)) return false;
  return (
    Number.isFinite(anchor.start) && Number.isFinite(anchor.end) && anchor.start !== anchor.end
  );
}

export function webSelectionAdjustmentKind(
  anchor: Annotation['anchor'],
): WebSelectionAdjustment['kind'] | null {
  if ('kind' in anchor && anchor.kind === 'pdf-text') return null;
  if (
    anchor.segmentId &&
    anchor.textStartInBook === undefined &&
    anchor.textEndInBook === undefined
  ) {
    return 'translation';
  }
  return 'source';
}

export function webSelectionAdjustmentDraggingHandle(
  adjustment: WebSelectionAdjustment,
  sourceOffset: number,
): SelectionAdjustmentHandle {
  const fixedOffset = adjustment.handle === 'start' ? adjustment.endOffset : adjustment.startOffset;
  return sourceOffset < fixedOffset ? 'start' : 'end';
}
