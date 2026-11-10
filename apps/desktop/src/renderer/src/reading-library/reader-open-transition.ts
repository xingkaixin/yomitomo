import { playReaderOpenHalo, stopReaderOpenHalo } from './reader-open-halo';

const MOVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const HINGE = 'cubic-bezier(0.32, 0.08, 0.24, 1)';
const FADE = 'cubic-bezier(0.2, 0, 0, 1)';
const COVER_OPEN_DEG = 165;
const LOAD_TIMEOUT_MS = 12_000;
const RETURN_TIMEOUT_MS = 400;

type Box = { left: number; top: number; width: number; height: number };
type Paper = { box: Box; color: string | null };
type ShapeKind = 'book' | 'card';

type Shape = {
  key: string;
  kind: ShapeKind;
  paperSelector: string;
  template: HTMLElement;
  faceOffset: { left: number; top: number };
  ratio: number;
  depthRatio: number;
  cardColor: string;
};

type Run = {
  anims: Animation[];
  mode: 'open' | 'close';
  overlay: HTMLElement | null;
  start: number;
  style: HTMLStyleElement;
};

let active: Run | null = null;
let lastShape: Shape | null = null;
const idleWaiters: (() => void)[] = [];

export type ReaderOpenTransition = { settle: (opened: boolean) => void };

export function startReaderOpenTransition(key: string): ReaderOpenTransition | null {
  finishActive();
  stopReaderOpenHalo();
  if (prefersReducedMotion()) return null;
  const item = findShelfItem(key);
  const cover = item?.querySelector<HTMLElement>('.library-shelf-item-cover > .article-book');
  if (!cover) return null;
  const shape = readShape(key, cover);
  if (!shape) return null;
  lastShape = shape;
  const source = faceBox(cover, shape.kind);
  return shape.kind === 'book' ? openBook(shape, source) : openCard(shape, source);
}

export function startReaderCloseTransition(key: string | null, returnToLibrary: () => void) {
  finishActive();
  stopReaderOpenHalo();
  const shape = lastShape?.key === key ? lastShape : null;
  const paper = shape ? findPaper(shape.paperSelector) : null;
  if (!shape || !paper || prefersReducedMotion()) {
    returnToLibrary();
    return;
  }
  if (shape.kind === 'book') closeBook(shape, paper, returnToLibrary);
  else closeCard(shape, paper, returnToLibrary);
}

function openBook(shape: Shape, source: Box): ReaderOpenTransition {
  const run = createRun(shape.key, 'open');
  const target = centeredBox(shape.ratio);
  const fx = buildBook(run, shape, target);
  const from = flipTransform(source, target);
  const sourceScene = findShelfItem(shape.key)?.querySelector<HTMLElement>('.article-book-scene');
  const hoverPose = sourceScene ? getComputedStyle(sourceScene).transform : 'none';

  play(run, fx.backdrop, [{ opacity: 0 }, { opacity: 1 }], 0, 240, FADE);
  play(run, fx.wrap, [{ transform: from }, { transform: 'none' }], 0, 260, MOVE);
  if (hoverPose !== 'none')
    play(run, fx.scene, [{ transform: hoverPose }, { transform: 'none' }], 0, 260, MOVE);
  for (const edge of fx.edges) setOpacityAt(run, edge, 0, 180);
  setOpacityAt(run, fx.page, 1, 180);
  hingeCover(run, fx, 180, 180, true);
  play(run, fx.front, [{ opacity: 1 }, { opacity: 0 }], 300, 80, FADE);

  return waitForPaper(run, shape, (paper, at) => {
    const pageAt = Math.max(280, at);
    paintPaper(fx.page, paper);
    play(
      run,
      fx.page,
      [px(sizeBox(target)), px(relativeBox(paper.box, target))],
      pageAt,
      200,
      MOVE,
    );
    return reveal(run, fx.root, pageAt + 110, 100);
  });
}

function openCard(shape: Shape, source: Box): ReaderOpenTransition {
  const run = createRun(shape.key, 'open');
  const fx = buildCard(run, shape, source);

  play(run, fx.backdrop, [{ opacity: 0 }, { opacity: 1 }], 0, 220, FADE);

  return waitForPaper(run, shape, (paper, at) => {
    const scale = paper.box.width / source.width;
    play(
      run,
      fx.sheet,
      [
        { ...px(source), backgroundColor: shape.cardColor },
        { ...px(paper.box), backgroundColor: paper.color ?? shape.cardColor },
      ],
      at,
      320,
      MOVE,
    );
    play(run, fx.face, [{ transform: 'none' }, { transform: `scale(${scale})` }], at, 320, MOVE);
    play(run, fx.face, [{ opacity: 1 }, { opacity: 0 }], at, 150, FADE);
    return reveal(run, fx.root, at + 200, 140);
  });
}

function closeBook(shape: Shape, paper: Paper, returnToLibrary: () => void) {
  const run = createRun(shape.key, 'close');
  const target = centeredBox(shape.ratio);
  const fx = buildBook(run, shape, target);
  paintPaper(fx.page, paper);
  fx.backdrop.style.opacity = '1';
  fx.page.style.opacity = '1';
  for (const edge of fx.edges) edge.style.opacity = '0';

  play(run, fx.root, [{ opacity: 0 }, { opacity: 1 }], 0, 80, FADE);
  play(run, fx.page, [px(relativeBox(paper.box, target)), px(sizeBox(target))], 30, 150, MOVE);
  play(run, fx.front, [{ opacity: 0 }, { opacity: 1 }], 100, 70, FADE);
  hingeCover(run, fx, 100, 140, false);
  for (const edge of fx.edges) setOpacityAt(run, edge, 1, 240);

  returnAfterCover(run, shape, returnToLibrary, (item, at) => {
    const flyAt = Math.max(170, at);
    play(run, fx.backdrop, [{ opacity: 1 }, { opacity: 0 }], flyAt - 20, 170, FADE);
    if (!item) {
      play(
        run,
        fx.wrap,
        [{ opacity: 1 }, { opacity: 0, transform: 'scale(0.92)' }],
        flyAt,
        150,
        FADE,
      );
      return;
    }
    const cover = item.querySelector<HTMLElement>('.library-shelf-item-cover > .article-book');
    if (!cover) return;
    const scene = cover.querySelector<HTMLElement>('.article-book-scene');
    const hoverPose = scene ? getComputedStyle(scene).transform : 'none';
    const to = flipTransform(faceBox(cover, 'book'), target);
    play(run, fx.wrap, [{ transform: 'none' }, { transform: to }], flyAt, 150, MOVE);
    if (hoverPose !== 'none')
      play(run, fx.scene, [{ transform: 'none' }, { transform: hoverPose }], flyAt, 150, MOVE);
  });
}

function closeCard(shape: Shape, paper: Paper, returnToLibrary: () => void) {
  const run = createRun(shape.key, 'close');
  const fx = buildCard(run, shape, paper.box);
  fx.backdrop.style.opacity = '1';
  fx.sheet.style.backgroundColor = paper.color ?? shape.cardColor;
  fx.face.style.opacity = '0';

  play(run, fx.root, [{ opacity: 0 }, { opacity: 1 }], 0, 80, FADE);

  returnAfterCover(run, shape, returnToLibrary, (item, at) => {
    const cover = item?.querySelector<HTMLElement>('.library-shelf-item-cover > .article-book');
    const sheetAt = Math.max(80, at);
    play(run, fx.backdrop, [{ opacity: 1 }, { opacity: 0 }], sheetAt + 40, 180, FADE);
    if (!cover) {
      play(
        run,
        fx.sheet,
        [{ opacity: 1 }, { opacity: 0, transform: 'scale(0.96)' }],
        sheetAt,
        180,
        FADE,
      );
      return;
    }
    const card = faceBox(cover, 'card');
    const scale = paper.box.width / card.width;
    play(
      run,
      fx.sheet,
      [
        { ...px(paper.box), backgroundColor: paper.color ?? shape.cardColor },
        { ...px(card), backgroundColor: shape.cardColor },
      ],
      sheetAt,
      260,
      MOVE,
    );
    play(
      run,
      fx.face,
      [{ transform: `scale(${scale})` }, { transform: 'none' }],
      sheetAt,
      260,
      MOVE,
    );
    play(run, fx.face, [{ opacity: 0 }, { opacity: 1 }], sheetAt + 100, 160, FADE);
  });
}

function hingeCover(run: Run, fx: BookFx, at: number, duration: number, opening: boolean) {
  const open = `translateZ(0) rotateY(-${COVER_OPEN_DEG}deg)`;
  const shut = 'translateZ(0) rotateY(0deg)';
  play(
    run,
    fx.front,
    [{ transform: opening ? shut : open }, { transform: opening ? open : shut }],
    at,
    duration,
    HINGE,
  );
  // 封面过了 90° 就该露出内封。front 上的 opacity 会压平 preserve-3d，背面剔除失效，
  // 所以用同一条缓动在 90° 对应的进度上切换内封的不透明度。
  const flip = opening ? 90 / COVER_OPEN_DEG : 1 - 90 / COVER_OPEN_DEG;
  const [before, after] = opening ? [0, 1] : [1, 0];
  play(
    run,
    fx.inside,
    [
      { opacity: before },
      { opacity: before, offset: flip },
      { opacity: after, offset: flip },
      { opacity: after },
    ],
    at,
    duration,
    HINGE,
  );
}

type BookFx = ReturnType<typeof buildBook>;

function buildBook(run: Run, shape: Shape, target: Box) {
  const { root, backdrop } = buildRoot(run, run.mode === 'open');
  const wrap = el('reader-transition-book');
  Object.assign(wrap.style, px(target));
  const page = el('reader-transition-page');
  Object.assign(page.style, px(sizeBox(target)));
  const book = shape.template.cloneNode(true) as HTMLElement;
  book.style.setProperty('--book-cover-height', `${target.height}px`);
  book.style.setProperty('--book-depth', `${target.width * shape.depthRatio}px`);
  book.style.left = `${-shape.faceOffset.left}px`;
  book.style.top = `${-shape.faceOffset.top}px`;
  const front = book.querySelector<HTMLElement>('.article-book-front')!;
  const inside = el('reader-transition-inside');
  front.append(inside);
  wrap.append(page, book);
  root.append(wrap);
  return {
    root,
    backdrop,
    wrap,
    page,
    front,
    inside,
    scene: book.querySelector<HTMLElement>('.article-book-scene')!,
    edges: [...book.querySelectorAll<HTMLElement>('.article-book-back, .article-book-pages')],
  };
}

function buildCard(run: Run, shape: Shape, box: Box) {
  const { root, backdrop } = buildRoot(run, run.mode === 'open');
  const sheet = el('reader-transition-sheet');
  Object.assign(sheet.style, px(box));
  sheet.style.backgroundColor = shape.cardColor;
  const face = shape.template.cloneNode(true) as HTMLElement;
  face.style.left = `${-shape.faceOffset.left}px`;
  face.style.top = `${-shape.faceOffset.top}px`;
  face.style.transformOrigin = `${shape.faceOffset.left}px ${shape.faceOffset.top}px`;
  sheet.append(face);
  root.append(sheet);
  return { root, backdrop, sheet, face };
}

function buildRoot(run: Run, snapshot: boolean) {
  const root = el('reader-transition');
  const backdrop = el('reader-transition-backdrop');
  const shell = document.querySelector<HTMLElement>('.app-shell');
  if (shell) backdrop.style.backgroundColor = getComputedStyle(shell).backgroundColor;
  if (shell && snapshot) root.append(snapshotOf(shell));
  root.append(backdrop);
  document.body.append(root);
  run.overlay = root;
  return { root, backdrop };
}

// 本地内容加载很快，阅读器往往在底色盖住书架之前就挂载了；打开时垫一份书架快照，底色淡入盖住的始终是书架。
function snapshotOf(shell: HTMLElement) {
  const copy = shell.cloneNode(true) as HTMLElement;
  copy.classList.add('reader-transition-snapshot');
  copy.inert = true;
  copy.setAttribute('aria-hidden', 'true');
  for (const node of copy.querySelectorAll('[id]')) node.removeAttribute('id');
  for (const image of copy.querySelectorAll('img')) {
    image.loading = 'eager';
    image.decoding = 'sync';
  }
  const scrolled = [...shell.querySelectorAll('*')].flatMap((node, index) =>
    node.scrollTop || node.scrollLeft
      ? [{ index, top: node.scrollTop, left: node.scrollLeft }]
      : [],
  );
  if (scrolled.length) {
    const nodes = copy.querySelectorAll('*');
    requestAnimationFrame(() => {
      for (const { index, top, left } of scrolled) nodes[index]?.scrollTo({ top, left });
    });
  }
  return copy;
}

function readShape(key: string, cover: HTMLElement): Shape | null {
  const scene = cover.querySelector<HTMLElement>('.article-book-scene');
  const card = cover.querySelector<HTMLElement>('.article-cover-card');
  const face = scene ?? card;
  if (!face || !face.offsetWidth || !face.offsetHeight) return null;
  const kind: ShapeKind = scene ? 'book' : 'card';
  const template = cover.cloneNode(true) as HTMLElement;
  template.classList.add('is-reader-transition');
  for (const image of template.querySelectorAll('img')) image.loading = 'eager';
  if (kind === 'card') {
    template.style.setProperty('--book-cover-height', `${face.offsetHeight}px`);
  }
  const pages = cover.querySelector<HTMLElement>('.article-book-pages');
  return {
    key,
    kind,
    paperSelector: paperSelectorFor(key, cover),
    template,
    faceOffset: { left: face.offsetLeft, top: face.offsetTop },
    ratio: face.offsetWidth / face.offsetHeight,
    depthRatio: pages ? (pages.offsetWidth + 2) / face.offsetWidth : 0.25,
    cardColor: card ? getComputedStyle(card).backgroundColor : '',
  };
}

function paperSelectorFor(key: string, cover: HTMLElement) {
  if (key.startsWith('weread:')) return '.weread-bookcase-body';
  if (cover.classList.contains('is-pdf-cover')) return '.pdfium-spike-page';
  if (cover.classList.contains('is-flat-cover')) return '.reader-article';
  return '.ebook-foliate-frame';
}

function findPaper(selector: string): Paper | null {
  const paper = document.querySelector<HTMLElement>(selector);
  if (!paper || paper.closest('.ebook-page-stage:not(.is-ready)')) return null;
  const rect = paper.getBoundingClientRect();
  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  const box = { left: rect.left, top, width: rect.width, height: bottom - top };
  if (box.width < 8 || box.height < 8) return null;
  const color = getComputedStyle(paper).backgroundColor;
  return { box, color: isTransparent(color) ? null : color };
}

function waitForPaper(
  run: Run,
  shape: Shape,
  proceed: (paper: Paper, at: number) => Promise<void>,
): ReaderOpenTransition {
  let failed = false;
  let previous: Box | null = null;
  const poll = () => {
    if (active !== run) return;
    const now = elapsed(run);
    const paper = findPaper(shape.paperSelector);
    // 纸面第一次排版后可能还会居中或缩放一次，位置连续两帧不变再展开。
    const stable = paper && previous && sameBox(paper.box, previous);
    previous = paper?.box ?? null;
    if (paper && stable) {
      run.overlay?.classList.remove('is-waiting');
      void proceed(paper, now).then(() => {
        if (active !== run) return;
        finishRun(run);
        // 微信读书正文是盖在页面上的原生视图，画布画不到它上面。
        if (!shape.key.startsWith('weread:')) playReaderOpenHalo(shape.paperSelector);
      }, noop);
      return;
    }
    if (now > 300) run.overlay?.classList.add('is-waiting');
    if (failed || now > LOAD_TIMEOUT_MS) return reverseRun(run);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  return {
    settle: (opened) => {
      failed = !opened;
    },
  };
}

function returnAfterCover(
  run: Run,
  shape: Shape,
  returnToLibrary: () => void,
  land: (item: HTMLElement | null, at: number) => void,
) {
  window.setTimeout(() => {
    if (active !== run) return returnToLibrary();
    returnToLibrary();
    const returnedAt = elapsed(run);
    const poll = () => {
      if (active !== run) return;
      const item = findShelfItem(shape.key)?.querySelector<HTMLElement>('.library-shelf-item');
      const now = elapsed(run);
      if (!item && now - returnedAt < RETURN_TIMEOUT_MS) {
        requestAnimationFrame(poll);
        return;
      }
      item?.scrollIntoView({ block: 'nearest' });
      land(item ?? null, now);
      void Promise.all(run.anims.map((anim) => anim.finished)).then(() => finishRun(run), noop);
    };
    requestAnimationFrame(poll);
  }, 80);
}

async function reveal(run: Run, overlay: HTMLElement, at: number, duration: number) {
  play(run, overlay, [{ opacity: 1 }, { opacity: 0 }], at, duration, FADE);
  await Promise.all(run.anims.map((anim) => anim.finished));
}

function createRun(key: string, mode: 'open' | 'close'): Run {
  const style = document.createElement('style');
  style.textContent = `[data-library-item="${CSS.escape(key)}"] .library-shelf-item-cover { visibility: hidden; }`;
  document.head.append(style);
  document.documentElement.dataset.readerTransition = mode;
  const run: Run = { anims: [], mode, overlay: null, start: performance.now(), style };
  active = run;
  return run;
}

function finishRun(run: Run) {
  if (active !== run) return;
  active = null;
  run.style.remove();
  run.overlay?.remove();
  for (const anim of run.anims) anim.cancel();
  delete document.documentElement.dataset.readerTransition;
  // 解除 animation: none 会让阅读器的进场动画从头再播一遍，阅读器闪一下；直接跳到终点。
  for (const content of document.querySelectorAll('.library-shelf-content')) {
    for (const anim of content.getAnimations()) anim.finish();
  }
  for (const resolve of idleWaiters.splice(0)) resolve();
}

// 原生视图（微信读书小窗）盖在所有页面元素之上，要等过渡结束再显示。
export function readerTransitionIdle() {
  return active ? new Promise<void>((resolve) => idleWaiters.push(resolve)) : Promise.resolve();
}

function finishActive() {
  if (active) finishRun(active);
}

function reverseRun(run: Run) {
  run.overlay?.classList.remove('is-waiting');
  for (const anim of run.anims) anim.reverse();
  void Promise.all(run.anims.map((anim) => anim.finished)).then(() => finishRun(run), noop);
}

function play(
  run: Run,
  target: HTMLElement,
  keyframes: Keyframe[],
  at: number,
  duration: number,
  easing = 'linear',
) {
  const delay = Math.max(0, at - elapsed(run));
  const anim = target.animate(keyframes, { delay, duration, easing, fill: 'both' });
  run.anims.push(anim);
  return anim;
}

function setOpacityAt(run: Run, target: HTMLElement, opacity: number, at: number) {
  const delay = Math.max(0, at - elapsed(run));
  const anim = target.animate([{ opacity }, { opacity }], {
    delay,
    duration: 1,
    fill: 'forwards',
  });
  run.anims.push(anim);
}

function elapsed(run: Run) {
  return performance.now() - run.start;
}

function findShelfItem(key: string) {
  return document.querySelector<HTMLElement>(`[data-library-item="${CSS.escape(key)}"]`);
}

// 书架上的书 hover 时有 3D 变换，getBoundingClientRect 会量到旋转后的外接框；用外框位置加 offset 尺寸取平放时的封面。
function faceBox(cover: HTMLElement, kind: ShapeKind): Box {
  const face = cover.querySelector<HTMLElement>(
    kind === 'book' ? '.article-book-scene' : '.article-cover-card',
  )!;
  const frame = cover.getBoundingClientRect();
  return {
    left: frame.left + face.offsetLeft,
    top: frame.top + face.offsetTop,
    width: face.offsetWidth,
    height: face.offsetHeight,
  };
}

function centeredBox(ratio: number): Box {
  const height = Math.round(window.innerHeight * 0.5);
  const width = Math.round(height * ratio);
  return {
    left: Math.round((window.innerWidth - width) / 2),
    top: Math.round((window.innerHeight - height) / 2),
    width,
    height,
  };
}

function flipTransform(from: Box, to: Box) {
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
}

function sameBox(a: Box, b: Box) {
  return (
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

function relativeBox(box: Box, origin: Box): Box {
  return { ...box, left: box.left - origin.left, top: box.top - origin.top };
}

function sizeBox(box: Box): Box {
  return { left: 0, top: 0, width: box.width, height: box.height };
}

function px(box: Box) {
  return {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  };
}

function paintPaper(page: HTMLElement, paper: Paper) {
  if (paper.color) page.style.backgroundColor = paper.color;
}

function isTransparent(color: string) {
  return color === 'transparent' || /rgba\(.*,\s*0\)$/.test(color);
}

function el(className: string) {
  const node = document.createElement('div');
  node.className = className;
  return node;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function noop() {}
