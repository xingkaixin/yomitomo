const MOVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const EXIT = 'cubic-bezier(0.4, 0, 1, 1)';
const FADE = 'cubic-bezier(0.2, 0, 0, 1)';
const READY_TIMEOUT_MS = 300;

type Mode = 'open' | 'close';
type Point = { x: number; y: number };

type Run = {
  anims: Animation[];
  overlay: HTMLElement;
  panel: HTMLElement;
  start: number;
};

let active: Run | null = null;
let lastCrate: { collectionId: string; point: Point } | null = null;

export function openCollectionWithTransition(collectionId: string, open: () => void) {
  transition('open', collectionId, open);
}

export function closeCollectionWithTransition(collectionId: string, close: () => void) {
  transition('close', collectionId, close);
}

function transition(mode: Mode, collectionId: string, change: () => void) {
  finishActive();
  const panel = document.querySelector<HTMLElement>('.library-source-panel');
  if (!panel) return change();
  const reduced = prefersReducedMotion();
  const crate = mode === 'open' ? crateCenter(panel, collectionId) : null;
  if (crate) lastCrate = { collectionId, point: crate };
  // 返回时旧列表还没有木箱可量，用打开时记下的位置；新列表渲染后再量一次给进场用。
  const remembered = lastCrate?.collectionId === collectionId ? lastCrate.point : null;
  const outOrigin = crate ?? remembered ?? centerOf(panel);

  const run = createRun(mode, panel);
  run.overlay.style.transformOrigin = originIn(run.overlay, outOrigin);
  if (reduced) play(run, run.overlay, [{ opacity: 1 }, { opacity: 0 }], 0, 120, FADE);
  else if (mode === 'open')
    play(
      run,
      run.overlay,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(1.08)' },
      ],
      0,
      160,
      EXIT,
    );
  else
    play(
      run,
      run.overlay,
      [
        { opacity: 1, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(0.92)' },
      ],
      0,
      140,
      EXIT,
    );

  change();
  const scope = mode === 'open' ? collectionId : 'library';
  const poll = () => {
    if (active !== run) return;
    if (!listReady(panel, scope) && elapsed(run) < READY_TIMEOUT_MS) {
      requestAnimationFrame(poll);
      return;
    }
    enter(run, mode, collectionId, reduced, outOrigin);
    void Promise.all(run.anims.map((anim) => anim.finished)).then(() => finishRun(run), noop);
  };
  requestAnimationFrame(poll);
}

function enter(run: Run, mode: Mode, collectionId: string, reduced: boolean, outOrigin: Point) {
  const { panel } = run;
  if (reduced) {
    play(run, panel, [{ opacity: 0 }, { opacity: 1 }], 0, 120, FADE);
    return;
  }
  if (mode === 'open') {
    panel.style.transformOrigin = originIn(panel, outOrigin);
    play(
      run,
      panel,
      [
        { opacity: 0, transform: 'scale(0.92)' },
        { opacity: 1, transform: 'scale(1)' },
      ],
      60,
      240,
      MOVE,
    );
    return;
  }
  const crate = crateCenter(panel, collectionId);
  panel.style.transformOrigin = originIn(panel, crate ?? centerOf(panel));
  play(
    run,
    panel,
    [
      { opacity: 0, transform: 'scale(1.08)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    40,
    240,
    MOVE,
  );
  if (!crate) return;
  const members = crateElement(panel, collectionId)!.querySelectorAll<HTMLElement>(
    '.library-collection-crate-member',
  );
  members.forEach((member, index) =>
    play(
      run,
      member,
      [{ translate: '0 -10px' }, { translate: '0 0' }],
      160 + index * 20,
      260,
      MOVE,
    ),
  );
}

function createRun(mode: Mode, panel: HTMLElement): Run {
  const overlay = snapshotOf(panel);
  panel.after(overlay);
  panel.style.opacity = '0';
  document.documentElement.dataset.collectionTransition = mode;
  const run: Run = { anims: [], overlay, panel, start: performance.now() };
  active = run;
  return run;
}

function finishRun(run: Run) {
  if (active !== run) return;
  active = null;
  run.overlay.remove();
  for (const anim of run.anims) anim.cancel();
  run.panel.style.removeProperty('opacity');
  run.panel.style.removeProperty('transform-origin');
  delete document.documentElement.dataset.collectionTransition;
}

function finishActive() {
  if (active) finishRun(active);
}

// 快照留在原父级里，依赖祖先选择器的书架样式照常生效；绝对定位压在新列表上方。
function snapshotOf(panel: HTMLElement) {
  const copy = panel.cloneNode(true) as HTMLElement;
  copy.classList.add('collection-transition-snapshot');
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  for (const node of copy.querySelectorAll('[id], [data-library-item]')) {
    node.removeAttribute('id');
    node.removeAttribute('data-library-item');
  }
  copy.removeAttribute('id');
  // 翻页的进场动画挂在属性上，克隆体带着它会从透明重新播一遍进场。
  for (const node of copy.querySelectorAll('[data-page-leave]')) node.remove();
  for (const node of copy.querySelectorAll<HTMLElement>('[data-page-enter]')) {
    delete node.dataset.pageEnter;
  }
  Object.assign(copy.style, {
    left: `${panel.offsetLeft}px`,
    top: `${panel.offsetTop}px`,
    width: `${panel.offsetWidth}px`,
    height: `${panel.offsetHeight}px`,
  });
  const scrolled = [...panel.querySelectorAll('*')].flatMap((node, index) =>
    node.scrollTop ? [{ index, top: node.scrollTop }] : [],
  );
  if (scrolled.length) {
    const nodes = copy.querySelectorAll('*');
    requestAnimationFrame(() => {
      for (const { index, top } of scrolled) nodes[index]?.scrollTo({ top });
    });
  }
  return copy;
}

function listReady(panel: HTMLElement, scope: string) {
  return panel.dataset.listScope === scope && panel.getAttribute('aria-busy') !== 'true';
}

function crateElement(panel: HTMLElement, collectionId: string) {
  return panel.querySelector<HTMLElement>(
    `[data-library-item="${CSS.escape(`collection:${collectionId}`)}"] .library-collection-crate`,
  );
}

function crateCenter(panel: HTMLElement, collectionId: string): Point | null {
  const crate = crateElement(panel, collectionId);
  if (!crate) return null;
  const box = crate.getBoundingClientRect();
  const view = panel.getBoundingClientRect();
  const point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  const visible =
    point.x >= view.left && point.x <= view.right && point.y >= view.top && point.y <= view.bottom;
  return visible ? point : null;
}

function centerOf(element: HTMLElement): Point {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function originIn(element: HTMLElement, point: Point) {
  const box = element.getBoundingClientRect();
  return `${point.x - box.left}px ${point.y - box.top}px`;
}

function play(
  run: Run,
  target: HTMLElement,
  keyframes: Keyframe[],
  at: number,
  duration: number,
  easing: string,
) {
  const delay = Math.max(0, at - elapsed(run));
  run.anims.push(target.animate(keyframes, { delay, duration, easing, fill: 'both' }));
}

function elapsed(run: Run) {
  return performance.now() - run.start;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noop() {}
