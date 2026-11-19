import { useSyncExternalStore } from 'react';
import { useEventListener } from '@yomitomo/reader-ui/use-event-listener';
import { isEditableKeyboardTarget } from '../../shell/use-reader-page-turn-keys';

const PDF_EYE_CARE_STORAGE_KEY = 'yomitomo.desktop.pdfEyeCareMode';
const PDF_EYE_CARE_EVENT = 'yomitomo:desktop-pdf-eye-care';

export type PdfZoomShortcutAction = 'in' | 'out' | 'reset';

export function readPdfEyeCareMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(PDF_EYE_CARE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePdfEyeCareMode(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PDF_EYE_CARE_STORAGE_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent<boolean>(PDF_EYE_CARE_EVENT, { detail: enabled }));
  } catch {
    // Eye-care preference is local; persistence failure should not interrupt reading.
  }
}

function subscribePdfEyeCareMode(listener: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(PDF_EYE_CARE_EVENT, listener);
  return () => window.removeEventListener(PDF_EYE_CARE_EVENT, listener);
}

export function usePdfEyeCareMode() {
  const enabled = useSyncExternalStore(subscribePdfEyeCareMode, readPdfEyeCareMode, () => false);
  return [enabled, writePdfEyeCareMode] as const;
}

export function pdfZoomActionFromKeyboardEvent(
  event: Pick<
    KeyboardEvent,
    'altKey' | 'ctrlKey' | 'defaultPrevented' | 'key' | 'metaKey' | 'target'
  >,
): PdfZoomShortcutAction | null {
  if (event.defaultPrevented || event.altKey) return null;
  if (!event.metaKey && !event.ctrlKey) return null;
  if (isEditableKeyboardTarget(event.target)) return null;
  if (event.key === '+' || event.key === '=') return 'in';
  if (event.key === '-' || event.key === '_') return 'out';
  if (event.key === '0') return 'reset';
  return null;
}

export function usePdfZoomShortcuts({
  enabled = true,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: {
  enabled?: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
}) {
  useEventListener(
    enabled ? window : null,
    'keydown',
    (event) => {
      const action = pdfZoomActionFromKeyboardEvent(event);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === 'in') onZoomIn();
      else if (action === 'out') onZoomOut();
      else onZoomReset();
    },
    { capture: true },
  );
}
