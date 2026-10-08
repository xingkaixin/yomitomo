import { useEffect, useState, type RefObject } from 'react';
import { findTocTargets, type TocItem } from '@yomitomo/core';
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

    const sortedItems = tocItems
      .filter((item) => item.index >= 0)
      .toSorted((left, right) => left.start - right.start);
    const resolveTargets = () => findTocTargets(articleElement, sortedItems, sourceTocOptions);
    let targets = resolveTargets();
    let frame = 0;
    const update = () => {
      frame = 0;
      if (targets.some((target) => target && !target.isConnected)) targets = resolveTargets();
      const nextIndex = webActiveTocIndex(scrollElement, sortedItems, targets);
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
  scrollElement: HTMLElement,
  sortedItems: TocItem[],
  targets: Array<HTMLElement | null>,
) {
  const scrollRect = scrollElement.getBoundingClientRect();
  const sampleY = scrollRect.top + scrollRect.height * 0.2;
  let firstIndex: number | null = null;
  let activeIndex: number | null = null;

  for (const [position, item] of sortedItems.entries()) {
    const target = targets[position];
    if (!target) continue;
    firstIndex ??= item.index;
    if (target.getBoundingClientRect().top <= sampleY) activeIndex = item.index;
    else break;
  }

  return activeIndex ?? firstIndex;
}
