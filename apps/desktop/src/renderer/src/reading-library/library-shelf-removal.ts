const MOVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const DRIFT = 'cubic-bezier(0.25, 0.6, 0.35, 1)';
const FADE = 'cubic-bezier(0.2, 0, 0, 1)';
const LIFT_MS = 170;
const SCATTER_LEAD_MS = 360;
const REMOVAL_TIMEOUT_MS = 2000;
const TILE_COLUMNS = 6;
const TILE_ROWS = 8;
const FLIP_ID = 'library-shelf-flip';

type ShelfLayout = {
  origin: DOMRect;
  boxes: Map<HTMLElement, DOMRect>;
  next: HTMLElement | null;
};

// The item stays in the catalog until the delete commits, so the animation runs first and the
// neighbours only close the gap once the catalog refetch has removed the item from the DOM.
export async function removeShelfItem(item: HTMLElement | null, commit: () => Promise<boolean>) {
  if (!item) {
    await commit();
    return;
  }
  if (item.dataset.leaving) return;
  item.dataset.leaving = 'lift';
  item.inert = true;

  const reduced = prefersReducedMotion();
  const fade = reduced
    ? item.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' })
    : null;
  if (fade) {
    await fade.finished;
  } else {
    await sleep(LIFT_MS);
    scatterCover(item);
    item.dataset.leaving = 'scatter';
    await sleep(SCATTER_LEAD_MS);
  }

  const grid = item.closest<HTMLElement>('.library-shelf-grid');
  const layout = grid ? readLayout(grid, item) : null;
  if (!(await commit())) {
    fade?.cancel();
    restore(item);
    return;
  }
  if (!grid || !layout || !(await waitForRemoval(grid, item))) return;
  if (!reduced) closeGap(grid, layout);
  refocus(layout.next);
}

function scatterCover(item: HTMLElement) {
  const cover = item.querySelector<HTMLElement>('.library-shelf-item-cover');
  const face = cover?.querySelector<HTMLElement>('.article-book-front, .article-cover-card');
  const stage = item.closest<HTMLElement>('.library-entity-scroll');
  if (!cover || !face || !stage) return;
  const faceBox = face.getBoundingClientRect();
  const coverBox = cover.getBoundingClientRect();
  const stageBox = stage.getBoundingClientRect();
  if (!faceBox.width || !faceBox.height) return;

  const layer = document.createElement('div');
  layer.className = 'library-shelf-scatter';
  layer.setAttribute('aria-hidden', 'true');
  placeBox(layer, stageBox.left, stageBox.top, stageBox.width, stageBox.height);

  const tileWidth = faceBox.width / TILE_COLUMNS;
  const tileHeight = faceBox.height / TILE_ROWS;
  const flights: Promise<Animation>[] = [];
  for (let row = 0; row < TILE_ROWS; row++) {
    for (let column = 0; column < TILE_COLUMNS; column++) {
      const left = faceBox.left - stageBox.left + column * tileWidth;
      const top = faceBox.top - stageBox.top + row * tileHeight;
      const tile = document.createElement('div');
      tile.className = 'library-shelf-scatter-tile';
      // The extra half pixel hides sub-pixel seams between neighbouring tiles.
      placeBox(tile, left, top, tileWidth + 0.5, tileHeight + 0.5);
      const copy = cover.cloneNode(true) as HTMLElement;
      placeBox(
        copy,
        coverBox.left - faceBox.left - column * tileWidth,
        coverBox.top - faceBox.top - row * tileHeight,
        coverBox.width,
        coverBox.height,
      );
      tile.append(copy);
      layer.append(tile);
      flights.push(flyTile(tile, column, row).finished);
    }
  }
  document.body.append(layer);
  void Promise.allSettled(flights).then(() => layer.remove());
}

// Tiles peel off from the fore edge (top right) towards the spine, like pages caught by a draft.
function flyTile(tile: HTMLElement, column: number, row: number) {
  const fromForeEdge = (TILE_COLUMNS - 1 - column) / (TILE_COLUMNS - 1);
  const fromTop = row / (TILE_ROWS - 1);
  const order = Math.hypot(fromForeEdge, fromTop) / Math.SQRT2;
  const dx = 16 + Math.random() * 44 + (column / TILE_COLUMNS) * 22;
  const dy = -(48 + Math.random() * 64) - (1 - fromTop) * 24;
  const rx = 28 + Math.random() * 46;
  const ry = (Math.random() - 0.5) * 36;
  const rz = (Math.random() - 0.5) * 48;
  return tile.animate(
    [
      { transform: 'perspective(600px)', opacity: 1 },
      { opacity: 1, offset: 0.3 },
      {
        transform: `perspective(600px) translate(${dx}px, ${dy}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg) scale(0.6)`,
        opacity: 0,
      },
    ],
    {
      duration: 460 + Math.random() * 140,
      delay: order * 240 + Math.random() * 40,
      easing: DRIFT,
      fill: 'both',
    },
  );
}

function readLayout(grid: HTMLElement, item: HTMLElement): ShelfLayout {
  const items = shelfItems(grid);
  const index = items.indexOf(item);
  const staying = (element: HTMLElement) => !element.dataset.leaving;
  const remaining = items.filter(staying);
  const next =
    items.slice(index + 1).find(staying) ?? items.slice(0, index).findLast(staying) ?? null;
  return {
    origin: grid.getBoundingClientRect(),
    boxes: new Map(remaining.map((element) => [element, element.getBoundingClientRect()])),
    next,
  };
}

function waitForRemoval(grid: HTMLElement, item: HTMLElement) {
  if (!item.isConnected) return Promise.resolve(true);
  // A mutation observer fires before the next paint, so neighbours never flash at their new slot.
  return new Promise<boolean>((resolve) => {
    const done = () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      resolve(!item.isConnected && grid.isConnected);
    };
    const observer = new MutationObserver(() => {
      if (!item.isConnected) done();
    });
    const timeout = window.setTimeout(done, REMOVAL_TIMEOUT_MS);
    observer.observe(grid, { childList: true, subtree: true });
  });
}

function closeGap(grid: HTMLElement, layout: ShelfLayout) {
  const origin = grid.getBoundingClientRect();
  let order = 0;
  for (const element of shelfItems(grid)) {
    const before = layout.boxes.get(element);
    if (!before) continue;
    for (const animation of element.getAnimations()) {
      if (animation.id === FLIP_ID) animation.cancel();
    }
    const after = element.getBoundingClientRect();
    const dx = before.left - layout.origin.left - (after.left - origin.left);
    const dy = before.top - layout.origin.top - (after.top - origin.top);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    // Books that wrap to the previous row would cut diagonally across the shelf; fade them in instead.
    const frames =
      Math.abs(dy) < 1
        ? [{ transform: `translateX(${dx}px)` }, { transform: 'none' }]
        : [
            { transform: 'translateX(36px)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ];
    const animation = element.animate(frames, {
      duration: 380,
      delay: Math.min(order++, 6) * 22,
      easing: MOVE,
      fill: 'backwards',
    });
    animation.id = FLIP_ID;
  }
}

function refocus(next: HTMLElement | null) {
  const active = document.activeElement;
  if (active && active !== document.body) return;
  if (!next?.isConnected) return;
  next.querySelector<HTMLElement>('.library-shelf-item-open')?.focus({ preventScroll: true });
}

function restore(item: HTMLElement) {
  delete item.dataset.leaving;
  item.inert = false;
  item
    .querySelector('.library-shelf-item-cover')
    ?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: FADE });
}

function shelfItems(grid: HTMLElement) {
  return [
    ...grid.querySelectorAll<HTMLElement>(':scope > .library-shelf-slot > .library-shelf-item'),
  ];
}

function placeBox(element: HTMLElement, left: number, top: number, width: number, height: number) {
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
