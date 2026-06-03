import { useLayoutEffect, useState, type RefObject } from 'react';

export function useElementWidthBelow(ref: RefObject<HTMLElement | null>, threshold: number) {
  const [isBelow, setIsBelow] = useState(false);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = (width: number) => {
      if (width > 0) setIsBelow(width <= threshold);
    };

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        updateWidth(entry.contentRect.width);
      });
      observer.observe(element);
      updateWidth(element.getBoundingClientRect().width);
      return () => observer.disconnect();
    }

    const handleResize = () => updateWidth(element.getBoundingClientRect().width);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [ref, threshold]);

  return isBelow;
}
