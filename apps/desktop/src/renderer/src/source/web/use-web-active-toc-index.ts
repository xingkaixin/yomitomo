import {
  createElement,
  useCallback,
  useEffectEvent,
  useReducer,
  useRef,
  type RefObject,
} from 'react';
import { findTocTargets, type TocItem } from '@yomitomo/core';
import { sourceTocOptions } from './use-web-reader-boxes';

type ActiveTocIndexEvent = { type: 'tocPositionMeasured'; index: number | null };

function activeTocIndexReducer(_current: number | null, event: ActiveTocIndexEvent) {
  return event.index;
}

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
  const [activeIndex, dispatch] = useReducer(activeTocIndexReducer, null);
  const itemsMeasuredRef = useRef<((items: TocItem[]) => void) | null>(null);
  const readTocItems = useEffectEvent(() => tocItems);

  // Rendered html replaces the toc targets, so tracking restarts for each article body.
  const attachContent = useCallback(
    (marker: HTMLElement | null) => {
      if (!marker) return;
      const scrollElement = scrollRef.current;
      const articleElement = articleRef.current;
      if (!scrollElement || !articleElement) {
        dispatch({ type: 'tocPositionMeasured', index: null });
        return;
      }

      let sortedItems = sortedTocItems(readTocItems());
      const resolveTargets = () => findTocTargets(articleElement, sortedItems, sourceTocOptions);
      let targets = resolveTargets();
      let frame = 0;
      const update = () => {
        frame = 0;
        if (targets.some((target) => target && !target.isConnected)) targets = resolveTargets();
        dispatch({
          type: 'tocPositionMeasured',
          index: webActiveTocIndex(scrollElement, sortedItems, targets),
        });
      };
      const schedule = () => {
        if (!frame) frame = window.requestAnimationFrame(update);
      };
      const itemsMeasured = (items: TocItem[]) => {
        sortedItems = sortedTocItems(items);
        targets = resolveTargets();
        schedule();
      };

      itemsMeasuredRef.current = itemsMeasured;
      schedule();
      scrollElement.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule);
      return () => {
        if (itemsMeasuredRef.current === itemsMeasured) itemsMeasuredRef.current = null;
        scrollElement.removeEventListener('scroll', schedule);
        window.removeEventListener('resize', schedule);
        if (frame) window.cancelAnimationFrame(frame);
      };
    },
    [articleRef, scrollRef],
  );

  const tocItemsMeasured = useCallback((items: TocItem[]) => {
    itemsMeasuredRef.current?.(items);
  }, []);

  return {
    activeIndex,
    marker: createElement('span', { hidden: true, key: contentVersion, ref: attachContent }),
    tocItemsMeasured,
  };
}

function sortedTocItems(items: TocItem[]) {
  return items
    .filter((item) => item.index >= 0)
    .toSorted((left, right) => left.start - right.start);
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
