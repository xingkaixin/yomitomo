import {
  isContinuousTextSelectionMouseEvent,
  type ReaderTextSelectionMouseEvent,
} from '../bookcase/source-reader-selection-events';

const PDFIUM_CONTINUOUS_TEXT_SELECTION_EVENT_TYPES = new Set(['mousedown', 'click', 'dblclick']);
const PDFIUM_INTERACTIVE_TARGET_SELECTOR =
  'a[href], button, input, textarea, select, summary, [role="button"], [contenteditable=""], [contenteditable="true"]';
const PDFIUM_PAGE_SELECTOR = '[data-pdfium-page-index]';

type PdfiumContinuousTextSelectionEvent = ReaderTextSelectionMouseEvent & {
  nativeEvent?: {
    stopImmediatePropagation?: () => void;
  };
  preventDefault: () => void;
  stopImmediatePropagation?: () => void;
  stopPropagation: () => void;
  target: EventTarget | null;
  type: string;
};

export function shouldSuppressPdfiumContinuousTextSelectionEvent(
  event: Pick<PdfiumContinuousTextSelectionEvent, 'button' | 'detail' | 'target' | 'type'>,
) {
  if (!PDFIUM_CONTINUOUS_TEXT_SELECTION_EVENT_TYPES.has(event.type)) return false;
  if (!isContinuousTextSelectionMouseEvent(event)) return false;

  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(PDFIUM_PAGE_SELECTOR)) return false;
  return !target.closest(PDFIUM_INTERACTIVE_TARGET_SELECTOR);
}

export function suppressPdfiumContinuousTextSelectionEvent(
  event: PdfiumContinuousTextSelectionEvent,
) {
  if (!shouldSuppressPdfiumContinuousTextSelectionEvent(event)) return false;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  event.nativeEvent?.stopImmediatePropagation?.();
  return true;
}
