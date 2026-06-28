const CONTINUOUS_TEXT_SELECTION_CLICK_DETAIL = 2;

export type ReaderTextSelectionMouseEvent = Pick<MouseEvent, 'button' | 'detail'>;

export function isContinuousTextSelectionMouseEvent(event: ReaderTextSelectionMouseEvent) {
  return event.button === 0 && event.detail >= CONTINUOUS_TEXT_SELECTION_CLICK_DETAIL;
}
