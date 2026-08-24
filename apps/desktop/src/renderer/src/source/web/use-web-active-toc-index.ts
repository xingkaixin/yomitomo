import { useEffect, useState, type RefObject } from 'react';
import { findCurrentTocTarget, type TocItem } from '@yomitomo/core';
import { sourceTocOptions } from './use-web-reader-boxes';

export function useWebActiveTocIndex({
  articleRef,
  contentVersion,
  scrollRef,
  tocItems,
}: {
  articleRef: RefObject<HTMLElement | null>;
  contentVersion: string;
  scrollRef: RefObject<HTMLElement | null>;
  tocItems: TocItem[];
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    const articleElement = articleRef.current;
    if (!scrollElement || !articleElement || tocItems.length === 0) {
      setActiveIndex(null);
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const nextIndex = webActiveTocIndex(articleElement, scrollElement, tocItems);
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    schedule();
    scrollElement.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      scrollElement.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [articleRef, contentVersion, scrollRef, tocItems]);

  return activeIndex;
}

function webActiveTocIndex(
  articleElement: HTMLElement,
  scrollElement: HTMLElement,
  tocItems: TocItem[],
) {
  const scrollRect = scrollElement.getBoundingClientRect();
  const sampleY = scrollRect.top + scrollRect.height * 0.2;
  const sortedItems = tocItems
    .filter((item) => item.index >= 0)
    .toSorted((left, right) => left.start - right.start);
  let firstIndex: number | null = null;
  let activeIndex: number | null = null;

  for (const item of sortedItems) {
    const target = findCurrentTocTarget(articleElement, item, sourceTocOptions);
    if (!target) continue;
    firstIndex ??= item.index;
    if (target.getBoundingClientRect().top <= sampleY) activeIndex = item.index;
    else break;
  }

  return activeIndex ?? firstIndex;
}
