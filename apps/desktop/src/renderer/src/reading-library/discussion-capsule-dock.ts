export type DiscussionDockCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

type Point = { x: number; y: number };
type Piece = Point & { element: HTMLElement; offset: number; vx: number; vy: number };
type Gesture = {
  pointerId: number;
  piece: Piece;
  start: Point;
  origin: Point;
  dragging: boolean;
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(Math.max(min, max), value));

export function bindDiscussionCapsuleDock(
  viewport: HTMLDivElement,
  options: {
    corner: DiscussionDockCorner;
    onDock: (corner: DiscussionDockCorner) => void;
    positionLabel: (corner: DiscussionDockCorner) => string;
  },
) {
  const groupElement = viewport.querySelector<HTMLElement>('.annotation-discussion-capsules');
  const landingElement = viewport.querySelector<HTMLElement>(
    '.annotation-discussion-capsules-landing',
  );
  const outlineElement = landingElement?.querySelector('.annotation-discussion-capsules-outlines');
  const status = viewport.querySelector<HTMLElement>('[role="status"]');
  if (!groupElement || !landingElement || !outlineElement) return;
  const group = groupElement;
  const landing = landingElement;
  const outlines = outlineElement;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let corner = options.corner;
  let candidate = corner;
  let pieces: Piece[] = [];
  let base: Point = { x: 0, y: 0 };
  let gesture: Gesture | null = null;
  let frame = 0;
  let lastTime = 0;
  let suppressClick = false;

  function destination(target: DiscussionDockCorner): Point {
    return {
      x: target.endsWith('right') ? viewport.clientWidth - group.offsetWidth - 18 : 18,
      y: target.startsWith('bottom') ? viewport.clientHeight - group.offsetHeight - 18 : 18,
    };
  }

  function showLanding() {
    const target = destination(candidate);
    landing.style.transform = `translate3d(${target.x}px, ${target.y}px, 0)`;
    viewport.dataset.corner = candidate;
    const label = options.positionLabel(candidate);
    if (status && status.textContent !== label) status.textContent = label;
  }

  function paint() {
    group.style.transform = `translate3d(${base.x}px, ${base.y}px, 0)`;
    for (const piece of pieces) {
      piece.element.style.transform = `translate3d(${piece.x - base.x}px, ${piece.y - base.y}px, 0)`;
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }

  function tick(now: number) {
    frame = 0;
    const dt = Math.min((now - (lastTime || now - 16)) / 1000, 0.032);
    lastTime = now;
    let moving = false;
    const leadIndex = gesture ? pieces.indexOf(gesture.piece) : 0;
    for (const [index, piece] of pieces.entries()) {
      if (gesture?.dragging && (piece === gesture.piece || reducedMotion.matches)) {
        piece.vx = (base.x - piece.x) / dt;
        piece.vy = (base.y - piece.y) / dt;
        piece.x = base.x;
        piece.y = base.y;
      } else if (!gesture) {
        advance(piece, dt, reducedMotion.matches ? 54 : 31);
      } else if (gesture.dragging) {
        advance(piece, dt, 38 - Math.min(Math.abs(index - leadIndex), 3) * 3);
        const dx = piece.x - base.x;
        const dy = piece.y - base.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 32) {
          piece.x = base.x + (dx / distance) * 32;
          piece.y = base.y + (dy / distance) * 32;
        }
      }
      piece.x = clamp(piece.x, 0, viewport.clientWidth - piece.element.offsetWidth);
      piece.y = clamp(
        piece.y,
        -piece.offset,
        viewport.clientHeight - piece.offset - piece.element.offsetHeight,
      );
      moving ||= Math.hypot(piece.x - base.x, piece.y - base.y) > 0.1;
    }
    paint();
    if (moving && (!gesture || gesture.dragging)) schedule();
    else lastTime = 0;
  }

  function advance(piece: Piece, dt: number, omega: number) {
    const step = dt / 4;
    for (let i = 0; i < 4; i++) {
      piece.vx += ((base.x - piece.x) * omega * omega - 1.95 * omega * piece.vx) * step;
      piece.vy += ((base.y - piece.y) * omega * omega - 1.95 * omega * piece.vy) * step;
      piece.x += piece.vx * step;
      piece.y += piece.vy * step;
    }
    if (Math.hypot(piece.x - base.x, piece.y - base.y) < 0.1) {
      piece.x = base.x;
      piece.y = base.y;
      piece.vx = 0;
      piece.vy = 0;
    }
  }

  function finish(cancelled: boolean) {
    const current = gesture;
    if (!current) return;
    gesture = null;
    viewport.classList.remove('is-dragging');
    current.piece.element.classList.remove('is-grabbed');
    if (current.piece.element.hasPointerCapture(current.pointerId)) {
      current.piece.element.releasePointerCapture(current.pointerId);
    }
    if (current.dragging && !cancelled) {
      corner = candidate;
      options.onDock(corner);
    }
    suppressClick = current.dragging;
    base = destination(corner);
    candidate = corner;
    showLanding();
    schedule();
  }

  function measure() {
    finish(true);
    for (const piece of pieces) piece.element.style.removeProperty('transform');
    const list = group.querySelector<HTMLElement>('.annotation-discussion-capsule-list');
    const scrollable = Boolean(list && list.scrollHeight > list.clientHeight + 1);
    list?.classList.toggle('is-scrollable', scrollable);
    const elements = [
      ...group.querySelectorAll<HTMLElement>(
        '.annotation-discussion-capsules-header, .annotation-discussion-capsules-toggle',
      ),
      ...(scrollable && list
        ? [list]
        : group.querySelectorAll<HTMLElement>('.annotation-discussion-capsule')),
    ];
    base = destination(corner);
    pieces = elements.map((element) => ({
      x: base.x,
      y: base.y,
      element,
      offset: element.offsetTop + (list && element.parentElement === list ? list.offsetTop : 0),
      vx: 0,
      vy: 0,
    }));
    landing.style.width = `${group.offsetWidth}px`;
    landing.style.height = `${group.offsetHeight}px`;
    outlines.replaceChildren(
      ...pieces.map((piece) => {
        const outline = document.createElement('span');
        outline.style.top = `${piece.offset}px`;
        outline.style.height = `${piece.element.offsetHeight}px`;
        return outline;
      }),
    );
    showLanding();
    paint();
  }

  function pointerDown(event: PointerEvent) {
    const target = event.target;
    if (event.button !== 0 || gesture || !(target instanceof Element)) return;
    if (target.closest('.annotation-discussion-capsules-collapse')) return;
    const piece = pieces.find((item) => item.element.contains(target));
    if (!piece) return;
    if (event.pointerType === 'touch' && piece.element.classList.contains('is-scrollable')) return;
    suppressClick = false;
    for (const item of pieces) {
      item.vx = 0;
      item.vy = 0;
    }
    gesture = {
      pointerId: event.pointerId,
      piece,
      start: { x: event.clientX, y: event.clientY },
      origin: { x: piece.x, y: piece.y },
      dragging: false,
    };
    // Capture before the pointer reaches an EPUB iframe, which would stop outer pointer events.
    piece.element.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const dx = event.clientX - gesture.start.x;
    const dy = event.clientY - gesture.start.y;
    if (!gesture.dragging && Math.hypot(dx, dy) <= 5) return;
    gesture.dragging = true;
    viewport.classList.add('is-dragging');
    gesture.piece.element.classList.add('is-grabbed');
    event.preventDefault();
    base = {
      x: clamp(gesture.origin.x + dx, 0, viewport.clientWidth - group.offsetWidth),
      y: clamp(gesture.origin.y + dy, 0, viewport.clientHeight - group.offsetHeight),
    };
    const centerX = base.x + group.offsetWidth / 2 - viewport.clientWidth / 2;
    const centerY = base.y + group.offsetHeight / 2 - viewport.clientHeight / 2;
    const bandX = Math.min(24, (viewport.clientWidth - group.offsetWidth) / 5);
    const bandY = Math.min(24, (viewport.clientHeight - group.offsetHeight) / 5);
    let horizontal: 'left' | 'right' = candidate.endsWith('right') ? 'right' : 'left';
    let vertical: 'top' | 'bottom' = candidate.startsWith('bottom') ? 'bottom' : 'top';
    if (centerX > bandX) horizontal = 'right';
    else if (centerX < -bandX) horizontal = 'left';
    if (centerY > bandY) vertical = 'bottom';
    else if (centerY < -bandY) vertical = 'top';
    candidate = `${vertical}-${horizontal}`;
    showLanding();
    schedule();
  }

  function pointerUp(event: PointerEvent) {
    if (gesture?.pointerId === event.pointerId) finish(event.type !== 'pointerup');
  }

  function keyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && gesture) {
      event.preventDefault();
      event.stopPropagation();
      finish(true);
      return;
    }
    if (!(event.target instanceof Element)) return;
    if (
      !event.target.matches(
        '.annotation-discussion-capsules-header, .annotation-discussion-capsules-toggle',
      )
    )
      return;
    const vertical = corner.startsWith('top') ? 'top' : 'bottom';
    const horizontal = corner.endsWith('left') ? 'left' : 'right';
    const targets: Partial<Record<string, DiscussionDockCorner>> = {
      ArrowLeft: `${vertical}-left`,
      ArrowRight: `${vertical}-right`,
      ArrowUp: `top-${horizontal}`,
      ArrowDown: `bottom-${horizontal}`,
    };
    const target = targets[event.key];
    if (!target) return;
    event.preventDefault();
    finish(true);
    corner = target;
    candidate = target;
    base = destination(target);
    options.onDock(target);
    showLanding();
    schedule();
  }

  function click(event: MouseEvent) {
    if (!suppressClick || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick = false;
  }

  const cancel = () => finish(true);
  const observer = new ResizeObserver(measure);
  observer.observe(viewport);
  observer.observe(group);
  viewport.addEventListener('pointerdown', pointerDown);
  viewport.addEventListener('lostpointercapture', pointerUp);
  viewport.addEventListener('click', click, true);
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerUp);
  window.addEventListener('pointercancel', pointerUp);
  window.addEventListener('keydown', keyDown, true);
  window.addEventListener('blur', cancel);
  measure();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    viewport.classList.remove('is-dragging');
    group.style.removeProperty('transform');
    for (const piece of pieces) {
      piece.element.classList.remove('is-grabbed');
      piece.element.style.removeProperty('transform');
    }
    viewport.removeEventListener('pointerdown', pointerDown);
    viewport.removeEventListener('lostpointercapture', pointerUp);
    viewport.removeEventListener('click', click, true);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('keydown', keyDown, true);
    window.removeEventListener('blur', cancel);
  };
}
