const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHover = window.matchMedia('(hover: hover)').matches;

function pressOnly(buttons: Iterable<HTMLElement>, active: HTMLElement) {
  for (const button of buttons) {
    button.classList.toggle('is-on', button === active);
    button.setAttribute('aria-pressed', String(button === active));
  }
}

function setupFlow() {
  const pin = document.querySelector<HTMLElement>('[data-flow-pin]');
  const sticky = document.querySelector<HTMLElement>('[data-flow-sticky]');
  const track = document.querySelector<HTMLElement>('[data-flow-track]');
  const desc = document.querySelector<HTMLElement>('[data-flow-desc]');
  const tabs = [...document.querySelectorAll<HTMLElement>('[data-flow-tab]')];
  const views = [...document.querySelectorAll<HTMLElement>('.win [data-view]')];
  if (!pin || !sticky || !track) return;

  // Pinning needs room for the window and bar; short viewports and reduced motion keep plain tabs.
  const pinnable = window.matchMedia(
    '(min-height: 620px) and (prefers-reduced-motion: no-preference)',
  );
  const lastStep = views.length - 1;
  let current = 0;

  const select = (index: number) => {
    current = index;
    const tab = tabs[index];
    if (tab) pressOnly(tabs, tab);
    if (desc) desc.textContent = tab?.dataset.desc ?? '';
    views.forEach((view, i) => {
      view.hidden = !pinnable.matches && i !== index;
      view.setAttribute('aria-hidden', String(i !== index));
    });
    syncWire();
  };

  const scrollRange = () => pin.offsetHeight - sticky.offsetHeight;
  const pinnedTop = () => Number.parseFloat(getComputedStyle(sticky).top);

  const sync = () => {
    if (!pinnable.matches) return;
    const scrolled = pinnedTop() - pin.getBoundingClientRect().top;
    const position = Math.min(Math.max(scrolled / scrollRange(), 0), 1) * lastStep;
    const step = Math.floor(position);
    const offset = step + settle(position - step);
    track.style.transform = `translate3d(${-offset * 100}%, 0, 0)`;
    const nearest = Math.round(offset);
    if (nearest !== current) select(nearest);
  };

  const applyMode = () => {
    pin.toggleAttribute('data-scrolling', pinnable.matches);
    track.style.transform = '';
    select(current);
    sync();
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      if (!pinnable.matches) {
        select(index);
        return;
      }
      const pinTop = pin.getBoundingClientRect().top + window.scrollY - pinnedTop();
      window.scrollTo({ top: pinTop + (scrollRange() * index) / lastStep, behavior: 'smooth' });
    });
  });

  let queued = false;
  const queueSync = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sync();
    });
  };
  window.addEventListener('scroll', queueSync, { passive: true });
  window.addEventListener('resize', queueSync);
  pinnable.addEventListener('change', applyMode);
  applyMode();
}

// Holds each view for the first and last quarter of its step, then eases across the middle.
function settle(progress: number) {
  const moved = Math.min(Math.max((progress - 0.25) / 0.5, 0), 1);
  return moved * moved * (3 - 2 * moved);
}

function setupCompanions() {
  const people = [...document.querySelectorAll<HTMLElement>('[data-person]')];
  const notes = [...document.querySelectorAll<HTMLElement>('.say .note')];
  for (const person of people) {
    person.addEventListener('click', () => {
      pressOnly(people, person);
      for (const note of notes) note.hidden = note.dataset.k !== person.dataset.person;
    });
  }
}

function setupFloatingNav() {
  const stage = document.querySelector('[data-hero-stage]');
  const nav = document.querySelector('[data-home-nav]');
  if (!stage || !nav) return;
  const sync = () => nav.classList.toggle('is-float', stage.getBoundingClientRect().top <= 0);
  window.addEventListener('scroll', sync, { passive: true });
  sync();
}

function setupBento() {
  if (reducedMotion) return;
  const playingUntil = new WeakMap<HTMLElement, number>();
  let nextAt = 0;

  const setState = (tile: HTMLElement, ...states: string[]) => {
    tile.classList.remove('hold', 'seen', 'play', 'blur');
    tile.classList.add(...states);
  };
  const play = (tile: HTMLElement) => {
    playingUntil.set(tile, performance.now() + 3000);
    setState(tile, 'seen', 'play');
  };
  const replay = (tile: HTMLElement) => {
    if (performance.now() < (playingUntil.get(tile) ?? 0)) return;
    playingUntil.set(tile, performance.now() + 3200);
    setState(tile, 'seen', 'play', 'blur');
    window.setTimeout(() => {
      setState(tile, 'seen', 'blur');
      // Two frames so the removed animation commits before it is re-added.
      requestAnimationFrame(() => requestAnimationFrame(() => setState(tile, 'seen', 'play')));
    }, 160);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        const now = performance.now();
        nextAt = Math.max(now + 200, nextAt + 250);
        window.setTimeout(() => play(entry.target as HTMLElement), nextAt - now);
      }
    },
    { threshold: 0.7 },
  );

  for (const tile of document.querySelectorAll<HTMLElement>('[data-tile]')) {
    setState(tile, 'hold');
    observer.observe(tile);
    tile.addEventListener('focus', () => replay(tile));
    if (canHover) tile.addEventListener('mouseenter', () => replay(tile));
  }
}

function syncWire() {
  const read = document.querySelector<HTMLElement>('.win [data-view="read"]');
  const wire = read?.querySelector<SVGSVGElement>('[data-wire]');
  const line = read?.querySelector<HTMLElement>('[data-anchor-line]');
  const note = read?.querySelector<HTMLElement>('.note.is-active');
  if (!read || read.hidden || !wire || !line || !note) return;
  const area = wire.parentElement;
  if (!area || getComputedStyle(wire).display === 'none') return;
  const box = area.getBoundingClientRect();
  const from = [...line.getClientRects()].at(-1);
  const to = note.getBoundingClientRect();
  if (!from) return;
  const x1 = from.right - box.left;
  const y1 = from.bottom - box.top - 4;
  const x2 = to.left - box.left - 6;
  const y2 = to.top - box.top + 28;
  const left = Math.min(x1, x2) - 8;
  const top = Math.min(y1, y2) - 8;
  const width = Math.max(x1, x2) - left + 8;
  const height = Math.max(y1, y2) - top + 8;
  const sx = x1 - left;
  const sy = y1 - top;
  const ex = x2 - left;
  const ey = y2 - top;
  const midX = (sx + ex) / 2;
  wire.setAttribute('width', String(width));
  wire.setAttribute('height', String(height));
  wire.setAttribute('viewBox', `0 0 ${width} ${height}`);
  wire.style.left = `${left}px`;
  wire.style.top = `${top}px`;
  wire
    .querySelector('path')
    ?.setAttribute(
      'd',
      `M${sx} ${sy} C ${midX} ${sy + 6}, ${midX} ${ey}, ${ex} ${ey} m-7 -5 l7 5 l-7 5`,
    );
}

setupFlow();
setupCompanions();
setupFloatingNav();
setupBento();
syncWire();
window.addEventListener('resize', syncWire);
void document.fonts?.ready.then(syncWire);
