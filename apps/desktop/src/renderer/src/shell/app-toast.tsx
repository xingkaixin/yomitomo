import { useCallback, useSyncExternalStore } from 'react';
import { GooeyToaster, gooeyToast } from 'goey-toast';
import type { AppThemeTone } from '../theme/app-theme';

export const appToast = gooeyToast;

const MIN_TOAST_TOP = 24;
const HEADER_TOAST_GAP = 12;

// The reader hides the sidebar and shows its own toolbar; other views float toasts inside the content panel.
export function useHeaderToastOffset(readerOpen: boolean) {
  const selector = readerOpen ? '.reader-toolbar' : '.app-shell > .settings-content';
  // Resubscribing per selector measures again one frame after the header switches.
  const subscribe = useCallback(
    (onLayoutChange: () => void) => {
      const frame = requestAnimationFrame(onLayoutChange);
      window.addEventListener('resize', onLayoutChange);
      return () => {
        cancelAnimationFrame(frame);
        window.removeEventListener('resize', onLayoutChange);
      };
    },
    [selector],
  );
  return useSyncExternalStore(subscribe, () => headerToastTop(selector, readerOpen));
}

function headerToastTop(selector: string, belowElement: boolean) {
  const rect = document.querySelector(selector)?.getBoundingClientRect();
  const edge = belowElement ? rect?.bottom : rect?.top;
  return edge && edge > 0 ? Math.round(edge) + HEADER_TOAST_GAP : MIN_TOAST_TOP;
}

export function AppToaster({ tone, topOffset }: { tone: AppThemeTone; topOffset: number }) {
  return (
    <>
      {/* sonner sets --offset-top inline on the container; override top only so the right edge stays at the default inset */}
      <style>{`[data-sonner-toaster][data-y-position='top']{--offset-top:${topOffset}px !important;}`}</style>
      <GooeyToaster position="top-right" preset="bouncy" theme={tone} />
    </>
  );
}
