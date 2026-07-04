import type { Annotation } from '@yomitomo/shared';
import type { SelectionAdjustmentHandle } from '@yomitomo/reader-ui/reader-app-view';
import { isAdjustableSelectionOffsetRange } from '../bookcase/selection-adjustment';

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

export function canAdjustWebSelectionAnchor(anchor: Annotation['anchor']) {
  if (!webSelectionAdjustmentKind(anchor)) return false;
  return isAdjustableSelectionOffsetRange(anchor.start, anchor.end);
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
