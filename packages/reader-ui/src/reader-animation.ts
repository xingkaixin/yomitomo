import type { HighlightBox } from '@yomitomo/core';
import { clampNumber } from './reader-settings';

export function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function animateTheaterHighlight(
  boxes: HighlightBox[],
  textLength: number,
  onFrame: (boxes: HighlightBox[]) => void,
) {
  const sortedBoxes = [...boxes].toSorted(
    (left, right) => left.top - right.top || left.left - right.left,
  );
  const duration = clampNumber(textLength * 28, 780, 2600, 1200);
  const start = performance.now();

  return new Promise<void>((resolve) => {
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased =
        progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const boxProgress = eased * sortedBoxes.length;
      const nextBoxes = sortedBoxes.flatMap((box, index) => {
        if (index < Math.floor(boxProgress)) return [box];
        if (index > Math.floor(boxProgress)) return [];

        const width = box.width * Math.max(0.08, boxProgress - index);
        return [{ ...box, width }];
      });
      onFrame(nextBoxes);

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        onFrame(sortedBoxes);
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}
