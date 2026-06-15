import { useEffect, useState } from 'react';
import { GooeyToaster, gooeyToast } from 'goey-toast';
import type { AppThemeTone } from '../theme/app-theme';

export const appToast = gooeyToast;

const MIN_TOAST_TOP = 24;
const HEADER_TOAST_GAP = 12;

// 阅读模式下全局 nav 被隐藏，可见顶部栏是 reader 自己的 toolbar；其余视图是 app-section-nav
export function useHeaderToastOffset(readerOpen: boolean) {
  const [topOffset, setTopOffset] = useState(MIN_TOAST_TOP);
  useEffect(() => {
    const selector = readerOpen ? '.reader-toolbar' : '.app-section-nav';
    const measure = () => {
      const element = document.querySelector(selector);
      const bottom = element ? element.getBoundingClientRect().bottom : 0;
      setTopOffset(bottom > 0 ? Math.round(bottom) + HEADER_TOAST_GAP : MIN_TOAST_TOP);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
    };
  }, [readerOpen]);
  return topOffset;
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
