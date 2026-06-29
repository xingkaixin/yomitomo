import type { Locator } from 'playwright-core';

export type E2eElementBox = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type VisibleBoxOptions = {
  minHeight?: number;
  minWidth?: number;
  timeout?: number;
};

type NoOverlapOptions = VisibleBoxOptions & {
  tolerance?: number;
};

export async function assertVisibleBox(locator: Locator, options: VisibleBoxOptions = {}) {
  await locator.waitFor({ state: 'visible', timeout: options.timeout ?? 10_000 });
  const box = await locator.boundingBox();
  if (!box) throw new Error('E2E_VISIBLE_BOX_UNAVAILABLE');

  const visibleBox = {
    bottom: box.y + box.height,
    height: box.height,
    left: box.x,
    right: box.x + box.width,
    top: box.y,
    width: box.width,
  };

  const minWidth = options.minWidth ?? 1;
  const minHeight = options.minHeight ?? 1;
  if (visibleBox.width < minWidth || visibleBox.height < minHeight) {
    throw new Error(
      `E2E_VISIBLE_BOX_TOO_SMALL ${formatBox(visibleBox)} expected >= ${minWidth}x${minHeight}`,
    );
  }
  return visibleBox;
}

export async function assertNoOverlap(
  first: Locator,
  second: Locator,
  options: NoOverlapOptions = {},
) {
  const firstBox = await assertVisibleBox(first, options);
  const secondBox = await assertVisibleBox(second, options);
  assertBoxesDoNotOverlap(firstBox, secondBox, options);
  return { firstBox, secondBox };
}

export function assertBoxesDoNotOverlap(
  firstBox: E2eElementBox,
  secondBox: E2eElementBox,
  options: Pick<NoOverlapOptions, 'tolerance'> = {},
) {
  if (!boxesOverlap(firstBox, secondBox, options.tolerance ?? 0)) return;
  throw new Error(`E2E_BOXES_OVERLAP first=${formatBox(firstBox)} second=${formatBox(secondBox)}`);
}

function boxesOverlap(firstBox: E2eElementBox, secondBox: E2eElementBox, tolerance: number) {
  const overlapsX =
    firstBox.left < secondBox.right - tolerance && firstBox.right > secondBox.left + tolerance;
  const overlapsY =
    firstBox.top < secondBox.bottom - tolerance && firstBox.bottom > secondBox.top + tolerance;
  return overlapsX && overlapsY;
}

function formatBox(box: E2eElementBox) {
  return [
    `left=${Math.round(box.left)}`,
    `top=${Math.round(box.top)}`,
    `width=${Math.round(box.width)}`,
    `height=${Math.round(box.height)}`,
  ].join(' ');
}
