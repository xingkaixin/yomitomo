import type {
  AnnotationDiscussionTransitionView,
  AnnotationDiscussionWindowTransition,
  WindowAnimationSourceRect,
} from '../../../ipc-contract';
import { getDesktopApi } from '../shell/app-desktop-api';

type Prepared = Extract<AnnotationDiscussionWindowTransition, { type: 'prepare' }>;
type Font = Omit<NonNullable<AnnotationDiscussionTransitionView['quote']>, 'text' | 'bounds'>;
type Run = {
  event: Prepared;
  direction: 'minimize' | 'restore';
  frame: HTMLDivElement;
  target: HTMLElement;
  animations: Animation[];
  generation: number;
  start: number;
  reduced: boolean;
  paint: (progress: number) => { element: HTMLElement; frame: Keyframe }[];
};

const runs = new Map<number, Run>();
const MOVE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress;

export function measureDiscussionWindowTransition(event: AnnotationDiscussionWindowTransition) {
  if (event.type !== 'measure') return;
  const root = document.querySelector<HTMLElement>('.annotation-discussion-window');
  const quote = root?.querySelector<HTMLElement>('.annotation-discussion-quote p');
  return getDesktopApi().annotations.discussion.transitionResponse({
    type: 'measured',
    windowId: event.windowId,
    transitionId: event.transitionId,
    view: {
      width: window.innerWidth,
      background: getComputedStyle(root ?? document.body).backgroundColor,
      quote: quote
        ? {
            text: quote.textContent ?? '',
            bounds: box(quote.getBoundingClientRect()),
            ...fontOf(quote),
          }
        : null,
    },
  });
}

export function clearDiscussionWindowPreviews() {
  for (const run of runs.values()) removeRun(run);
}

export async function animateDiscussionWindow(event: AnnotationDiscussionWindowTransition) {
  if (event.type === 'measure') return;
  if (event.type === 'cancel') {
    const run = runs.get(event.windowId);
    if (run?.event.transitionId === event.transitionId) removeRun(run);
    return;
  }
  if (event.type === 'animate') {
    const run = runs.get(event.windowId);
    if (run?.event.transitionId !== event.transitionId) return;
    run.direction = event.direction;
    if (run.frame.isConnected) await animateRun(run);
    return;
  }
  const previous = runs.get(event.windowId);
  if (previous) removeRun(previous);
  const target = transitionTarget(event.windowId);
  if (!target) {
    await respondReady(event, false);
    return;
  }
  const frame = document.createElement('div');
  frame.className = 'annotation-discussion-window-preview';
  frame.setAttribute('aria-hidden', 'true');
  const run: Run = {
    event,
    direction: event.direction,
    frame,
    target,
    animations: [],
    generation: 0,
    start: event.expanded ? 1 : 0,
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    paint: () => [],
  };
  runs.set(event.windowId, run);
  target.dataset.windowTransitionTarget = 'preparing';
  try {
    const image = new Image();
    image.alt = '';
    image.src = event.image;
    await image.decode();
    if (runs.get(event.windowId) !== run) return;
    run.paint = buildSurface(run, image);
    for (const { element, frame: style } of run.paint(run.reduced ? 1 : run.start)) {
      Object.assign(element.style, style);
    }
    if (run.reduced) frame.style.opacity = String(run.start);
    else target.dataset.windowTransitionTarget = 'moving';
    document.body.append(frame);
    // An occluded Electron renderer does not run animation frames until the native window hides.
    if (!document.hidden) await new Promise(requestAnimationFrame);
    if (runs.get(event.windowId) !== run) return;
    await respondReady(event, true);
  } catch (error) {
    removeRun(run);
    await respondReady(event, false);
    throw error;
  }
}

async function animateRun(run: Run) {
  const generation = ++run.generation;
  const bounds = run.event.bounds;
  const target = run.target.getBoundingClientRect();
  const current = run.animations.length
    ? run.reduced
      ? Number(getComputedStyle(run.frame).opacity)
      : clamp(
          (run.frame.getBoundingClientRect().width - target.width) / (bounds.width - target.width),
        )
    : run.start;
  const end = run.direction === 'restore' ? 1 : 0;
  for (const animation of run.animations) animation.cancel();
  run.animations = [];
  const duration = (run.reduced ? 150 : 300) * Math.abs(end - current);
  if (duration > 1) {
    if (run.reduced) {
      run.animations.push(
        run.frame.animate([{ opacity: current }, { opacity: end }], {
          duration,
          easing: MOVE,
          fill: 'forwards',
        }),
      );
    } else {
      const tracks = new Map<HTMLElement, Keyframe[]>();
      for (let index = 0; index <= 30; index++) {
        for (const sample of run.paint(mix(current, end, index / 30))) {
          const track = tracks.get(sample.element) ?? [];
          track.push(sample.frame);
          tracks.set(sample.element, track);
        }
      }
      for (const [element, keyframes] of tracks) {
        run.animations.push(
          element.animate(keyframes, { duration, easing: MOVE, fill: 'forwards' }),
        );
      }
      for (const { element, frame } of run.paint(end)) Object.assign(element.style, frame);
    }
    try {
      await Promise.all(run.animations.map((animation) => animation.finished));
    } catch {
      return;
    }
  }
  if (generation !== run.generation || runs.get(run.event.windowId) !== run) return;
  try {
    await getDesktopApi().annotations.discussion.transitionResponse({
      type: 'finished',
      windowId: run.event.windowId,
      transitionId: run.event.transitionId,
    });
    if (run.direction === 'minimize' && document.hasFocus())
      run.target.focus({ preventScroll: true });
  } finally {
    if (generation === run.generation) removeRun(run);
  }
}

function buildSurface(run: Run, image: HTMLImageElement): Run['paint'] {
  const { frame, target, event } = run;
  const bounds = event.bounds;
  const compact = box(target.getBoundingClientRect());
  const compactStyle = getComputedStyle(target);
  Object.assign(frame.style, {
    left: `${bounds.x}px`,
    top: `${bounds.y}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    background: compactStyle.background,
  });
  const paper = document.createElement('div');
  paper.className = 'annotation-discussion-window-preview-paper';
  paper.style.background = event.view.background;
  const body = document.createElement('div');
  body.className = 'annotation-discussion-window-preview-body';
  body.append(image);
  frame.append(paper, body);
  const compactContent = target.cloneNode(true) as HTMLElement;
  compactContent.removeAttribute('data-window-transition-target');
  compactContent.removeAttribute('data-window-id');
  compactContent.removeAttribute('title');
  compactContent.tabIndex = -1;
  Object.assign(compactContent.style, {
    position: 'absolute',
    left: '0',
    top: '0',
    margin: '0',
    width: `${compact.width}px`,
    height: `${compact.height}px`,
    font: compactStyle.font,
    color: compactStyle.color,
    background: 'transparent',
    borderColor: 'transparent',
    boxShadow: 'none',
    transformOrigin: 'top left',
    zIndex: 'auto',
  });
  const compactTitle = compactContent.querySelector<HTMLElement>(
    '.annotation-discussion-capsule-title',
  );
  if (compactTitle) compactTitle.style.visibility = 'hidden';
  frame.append(compactContent);
  const fold = document.createElement('div');
  fold.className = 'annotation-discussion-window-preview-fold';
  fold.style.borderBottomColor = getComputedStyle(target, '::after').borderBottomColor;
  frame.append(fold);
  const radii = [
    compactStyle.borderTopLeftRadius,
    compactStyle.borderTopRightRadius,
    compactStyle.borderBottomRightRadius,
    compactStyle.borderBottomLeftRadius,
  ].map(parseFloat);
  const quote = event.view.quote;
  const title = target.querySelector<HTMLElement>('.annotation-discussion-capsule-title');
  const scale = bounds.width / event.view.width;
  let quotePaint:
    | ((
        progress: number,
        sx: number,
        sy: number,
        x: number,
        y: number,
      ) => { element: HTMLElement; frame: Keyframe }[])
    | undefined;
  if (quote && title) {
    const source = {
      ...quote,
      bounds: {
        x: quote.bounds.x * scale,
        y: quote.bounds.y * scale,
        width: quote.bounds.width * scale,
        height: quote.bounds.height * scale,
      },
      fontSize: quote.fontSize * scale,
      lineHeight: quote.lineHeight * scale,
    };
    const cover = document.createElement('div');
    cover.className = 'annotation-discussion-window-preview-quote-cover';
    Object.assign(cover.style, {
      left: `${source.bounds.x}px`,
      top: `${source.bounds.y}px`,
      width: `${source.bounds.width}px`,
      height: `${source.bounds.height}px`,
      background: event.view.background,
    });
    body.append(cover);
    const clip = document.createElement('div');
    clip.className = 'annotation-discussion-window-preview-quote';
    clip.style.width = `${source.bounds.width}px`;
    clip.style.height = `${source.bounds.height}px`;
    frame.append(clip);
    const destination = box(title.getBoundingClientRect());
    const compactMask = getComputedStyle(title).maskImage;
    const compactFont = fontOf(title);
    const ratio = compactFont.fontSize / source.fontSize;
    const offsets = Array.from(
      title.querySelectorAll('.annotation-discussion-capsule-quote-track > span'),
      (unit) => unit.getBoundingClientRect(),
    )
      .filter(
        (rect) =>
          rect.width > 0 &&
          rect.right > destination.x &&
          rect.x < destination.x + destination.width,
      )
      .map((rect) => rect.x - destination.x);
    const texts = (offsets.length ? offsets : [0]).map((offset) => {
      const element = document.createElement('p');
      element.textContent = quote.text;
      Object.assign(element.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        fontSize: `${source.fontSize}px`,
        width: `${source.bounds.width}px`,
      });
      clip.append(element);
      return { element, offset };
    });
    quotePaint = (progress, sx, sy, x, y) => {
      const quoteScale = mix(ratio, 1, progress);
      const clipWidth = mix(destination.width, source.bounds.width, progress);
      const clipHeight = mix(destination.height, source.bounds.height, progress);
      return [
        {
          element: clip,
          frame: {
            transform: `translate(${(mix(destination.x, bounds.x + source.bounds.x, progress) - x) / sx}px, ${(mix(destination.y, bounds.y + source.bounds.y, progress) - y) / sy}px) scale(${1 / sx}, ${1 / sy})`,
            clipPath: `inset(0 ${Math.max(0, source.bounds.width - clipWidth)}px ${Math.max(0, source.bounds.height - clipHeight)}px 0)`,
            maskImage: progress < 0.5 ? compactMask : 'none',
          },
        },
        ...texts.map(({ element, offset }, index) => ({
          element,
          frame: {
            transform: `translateX(${mix(offset, 0, progress)}px) scale(${quoteScale})`,
            opacity: index === texts.length - 1 ? 1 : clamp(1 - progress / 0.3),
            fontFamily: progress < 0.5 ? compactFont.fontFamily : source.fontFamily,
            fontWeight: progress < 0.5 ? compactFont.fontWeight : source.fontWeight,
            lineHeight: `${mix(compactFont.lineHeight / ratio, source.lineHeight, progress)}px`,
            letterSpacing: progress < 0.5 ? compactFont.letterSpacing : source.letterSpacing,
            color: progress < 0.5 ? compactFont.color : source.color,
            whiteSpace: progress < 0.5 ? 'nowrap' : 'normal',
          },
        })),
      ];
    };
  }
  return (progress) => {
    const x = mix(compact.x, bounds.x, progress);
    const y = mix(compact.y, bounds.y, progress);
    const sx = mix(compact.width, bounds.width, progress) / bounds.width;
    const sy = mix(compact.height, bounds.height, progress) / bounds.height;
    const corners = radii.map((radius) => radius * (1 - progress));
    return [
      {
        element: frame,
        frame: {
          transform: `translate(${x - bounds.x}px, ${y - bounds.y}px) scale(${sx}, ${sy})`,
          borderRadius: `${corners.map((r) => `${r / sx}px`).join(' ')} / ${corners.map((r) => `${r / sy}px`).join(' ')}`,
        },
      },
      { element: paper, frame: { opacity: progress } },
      { element: body, frame: { opacity: clamp((progress - 0.55) / 0.45) } },
      {
        element: compactContent,
        frame: {
          opacity: clamp((0.15 - progress) / 0.15),
          transform: `scale(${1 / sx}, ${1 / sy})`,
        },
      },
      {
        element: fold,
        frame: {
          opacity: clamp((0.15 - progress) / 0.15),
          transform: `scale(${1 / sx}, ${1 / sy})`,
        },
      },
      ...(quotePaint?.(progress, sx, sy, x, y) ?? []),
    ];
  };
}

function transitionTarget(windowId: number) {
  const group = document.querySelector<HTMLElement>(
    `.annotation-discussion-capsules-viewport[data-window-ids~="${windowId}"] .annotation-discussion-capsules`,
  );
  const capsule = group?.querySelector<HTMLElement>(
    `.annotation-discussion-capsule[data-window-id="${windowId}"]`,
  );
  const list = capsule?.closest('.annotation-discussion-capsule-list');
  const rect = capsule?.getBoundingClientRect();
  const viewport = list?.getBoundingClientRect();
  if (rect && viewport && rect.top >= viewport.top && rect.bottom <= viewport.bottom)
    return capsule!;
  return (
    group?.querySelector<HTMLElement>(
      '.annotation-discussion-capsules-toggle, .annotation-discussion-capsules-header',
    ) ?? null
  );
}

function fontOf(element: HTMLElement): Font {
  const style = getComputedStyle(element);
  const fontSize = parseFloat(style.fontSize);
  return {
    fontFamily: style.fontFamily,
    fontSize,
    fontWeight: style.fontWeight,
    lineHeight: parseFloat(style.lineHeight) || fontSize * 1.2,
    letterSpacing: style.letterSpacing,
    color: style.color,
  };
}

function box(rect: DOMRect): WindowAnimationSourceRect {
  return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function removeRun(run: Run) {
  run.generation++;
  for (const animation of run.animations) animation.cancel();
  run.frame.remove();
  delete run.target.dataset.windowTransitionTarget;
  if (runs.get(run.event.windowId) === run) runs.delete(run.event.windowId);
}

function respondReady(event: Prepared, prepared: boolean) {
  return getDesktopApi().annotations.discussion.transitionResponse({
    type: 'ready',
    windowId: event.windowId,
    transitionId: event.transitionId,
    prepared,
  });
}
