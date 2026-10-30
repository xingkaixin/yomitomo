import { useCallback, useEffectEvent } from 'react';

/** Returns a ref callback that reports whether the element is at most `threshold` wide. */
export function useElementWidthBelowRef(threshold: number, onChange: (isBelow: boolean) => void) {
  const reportWidth = useEffectEvent((width: number) => {
    if (width > 0) onChange(width <= threshold);
  });

  return useCallback((element: HTMLElement | null) => {
    if (!element) return;

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        reportWidth(entry.contentRect.width);
      });
      observer.observe(element);
      reportWidth(element.getBoundingClientRect().width);
      return () => observer.disconnect();
    }

    const handleResize = () => reportWidth(element.getBoundingClientRect().width);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
}
