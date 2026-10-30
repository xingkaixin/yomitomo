import { useCallback, useSyncExternalStore } from 'react';
import { GooeyToaster, gooeyToast } from 'goey-toast';
import type { AppThemeTone } from '../theme/app-theme';

export const appToast = gooeyToast;

const MIN_TOAST_TOP = 24;
const HEADER_TOAST_GAP = 12;

// 阅读模式下全局 nav 被隐藏，可见顶部栏是 reader 自己的 toolbar；其余视图是 app-section-nav
export function useHeaderToastOffset(readerOpen: boolean) {
  const selector = readerOpen ? '.reader-toolbar' : '.app-section-nav';
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
  return useSyncExternalStore(subscribe, () => headerToastTop(selector));
}

function headerToastTop(selector: string) {
  const bottom = document.querySelector(selector)?.getBoundingClientRect().bottom ?? 0;
  return bottom > 0 ? Math.round(bottom) + HEADER_TOAST_GAP : MIN_TOAST_TOP;
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
