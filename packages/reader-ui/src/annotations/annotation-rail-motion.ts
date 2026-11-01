import type { AnnotationRailItem } from './annotation-rail-layout';

// Matches the stack pose transition on .reader-note, so a card's pose and position settle together.
const moveTiming = { duration: 220, easing: 'cubic-bezier(.22,1,.36,1)' };
const enterTiming = { duration: 180, easing: 'ease' };
const stackSwapDuration = 280;
// The incoming card clears the old front at this point of the swap, so the z-order change stays hidden.
const stackSwapCrossing = 0.45;
const stackSwapMaxLift = 96;
const stackSwapLiftRatio = 0.45;
const minJump = 1;

type RailPlacement = Pick<AnnotationRailItem, 'anchorTop' | 'top'>;

/**
 * The part of a card's vertical move that scrolling cannot explain. A card either follows its
 * anchor or holds at the rail edge, so any move between those two is continuous and stays 1:1.
 */
export function railCardJump(previous: RailPlacement, next: RailPlacement) {
  const moved = next.top - previous.top;
  const anchorMoved = next.anchorTop - previous.anchorTop;
  const continuous = Math.max(Math.min(0, anchorMoved), Math.min(moved, Math.max(0, anchorMoved)));
  return moved - continuous;
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function animateStackSwap(
  element: HTMLElement,
  previous: AnnotationRailItem,
  item: AnnotationRailItem,
) {
  const crossing = [0, stackSwapCrossing, stackSwapCrossing, 1];
  element.animate(
    {
      zIndex: [
        previous.style.zIndex,
        previous.style.zIndex,
        item.style.zIndex,
        item.style.zIndex,
      ].map(String),
      offset: crossing,
    },
    stackSwapDuration,
  );
  if (!item.isStackFront) return;
  const lift = Math.min(stackSwapMaxLift, element.offsetHeight * stackSwapLiftRatio);
  element.animate(
    {
      translate: ['0 0', `0 ${-lift}px`, '0 0'],
      offset: [0, stackSwapCrossing, 1],
      easing: [moveTiming.easing, 'cubic-bezier(.77,0,.175,1)'],
    },
    { duration: stackSwapDuration, composite: 'add' },
  );
}

export function animateRailChanges(
  previousItems: Map<string, AnnotationRailItem>,
  items: AnnotationRailItem[],
  noteElements: Map<string, HTMLElement>,
  { animateMoves }: { animateMoves: boolean },
) {
  for (const item of items) {
    const previous = previousItems.get(item.annotation.id);
    if (previous === item) continue;
    const element = noteElements.get(item.annotation.id);
    if (typeof element?.animate !== 'function') continue;

    // A card that changes rails would otherwise cross the whole article.
    if (!previous || previous.railSide !== item.railSide) {
      element.animate({ filter: ['blur(2px)', 'blur(0)'], opacity: [0, 1] }, enterTiming);
      continue;
    }

    if (!animateMoves || prefersReducedMotion()) continue;
    if (
      previous.isStackFront !== item.isStackFront &&
      previous.stackCount > 1 &&
      item.stackCount > 1
    ) {
      animateStackSwap(element, previous, item);
    }

    const jump = railCardJump(previous, item);
    if (Math.abs(jump) < minJump) continue;
    // Additive, so a new jump during a running one keeps the card's on-screen position and speed.
    element.animate({ translate: [`0 ${-jump}px`, '0 0'] }, { ...moveTiming, composite: 'add' });
  }
}
