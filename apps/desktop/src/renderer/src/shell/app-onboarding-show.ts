import type { ResolvedAppSettings } from '@yomitomo/shared';
import {
  ONBOARDING_BAR_SECONDS,
  ONBOARDING_SHOW_SECONDS,
  createOnboardingMusic,
} from '../sound/onboarding-music';

export type OnboardingShow = {
  dispose: () => void;
  setMuted: (muted: boolean) => void;
  skip: () => void;
};

// Seconds into the show, and the class the stage gains then. onboarding.css owns what each class
// reveals; the bars of onboarding-music.ts own what is heard at the same moment.
const cues: Array<[at: number, className: string]> = [
  [0.1, 'at-wordmark'],
  [0.25, 'at-book'],
  [0.5, 'at-line-1'],
  [1, 'at-line-2'],
  [1.5, 'at-line-3'],
  [2, 'at-rabbit'],
  [3, 'at-nod'],
  [3.55, 'at-duck'],
  [3.7, 'at-cover'],
  // The book needs 500ms to cover the window; opening earlier would show the page around it.
  [4.25, 'at-open'],
  [4.3, 'at-page'],
  [4.5, 'at-title-start'],
  [4.7, 'at-text-1'],
  [5.1, 'at-text-2'],
  [5.5, 'at-text-3'],
  [8, 'at-thought'],
  [8, 'at-title-end'],
  [10, 'at-reply'],
  [10, 'at-description'],
  [12, 'at-entry-1'],
  [12.5, 'at-entry-2'],
  [13, 'at-entry-3'],
  [13.5, 'at-rest'],
  [14, 'at-peek'],
];

const underlineStart = 3 * ONBOARDING_BAR_SECONDS;
const underlineSeconds = 1.1;
// Skipping lands on the last bar, so the music still resolves and the rabbit arrives on its beat.
const skipTarget = ONBOARDING_SHOW_SECONDS - ONBOARDING_BAR_SECONDS;

export function startOnboardingShow(
  stage: HTMLElement,
  settings: Partial<Pick<ResolvedAppSettings, 'soundEffectsEnabled' | 'soundEffectsVolume'>>,
): OnboardingShow {
  const music = createOnboardingMusic(settings);
  const passage = stage.querySelector<HTMLElement>('.onboarding-demo-passage');
  const underline = stage.querySelector<HTMLElement>('.onboarding-demo-underline');
  let startedAt = performance.now();
  let cueIndex = 0;
  let lines: Array<{ element: HTMLElement; width: number }> = [];
  let frame = 0;

  const position = () => (performance.now() - startedAt) / 1000;

  function layoutUnderline() {
    const mark = passage?.querySelector('mark');
    const page = underline?.offsetParent;
    if (!mark || !underline || !page) return;
    const origin = page.getBoundingClientRect();
    underline.replaceChildren();
    lines = Array.from(mark.getClientRects(), (rect) => {
      const element = document.createElement('i');
      element.style.left = `${rect.left - origin.left - page.clientLeft}px`;
      element.style.top = `${rect.bottom - origin.top - page.clientTop}px`;
      underline.append(element);
      return { element, width: rect.width };
    });
    drawUnderline(position());
  }

  function drawUnderline(at: number) {
    const progress = Math.min(1, Math.max(0, (at - underlineStart) / underlineSeconds));
    let remaining = progress * lines.reduce((sum, line) => sum + line.width, 0);
    for (const line of lines) {
      line.element.style.width = `${Math.min(line.width, Math.max(0, remaining))}px`;
      remaining -= line.width;
    }
  }

  function reach(at: number, limit: number) {
    for (; cueIndex < cues.length; cueIndex += 1) {
      const cue = cues[cueIndex];
      if (!cue || cue[0] > at || cue[0] >= limit) return;
      stage.classList.add(cue[1]);
    }
  }

  function tick() {
    frame = requestAnimationFrame(tick);
    const at = position();
    reach(at, Infinity);
    if (at < underlineStart + underlineSeconds + 0.5) drawUnderline(at);
    music?.advance(at);
  }

  function skip() {
    if (position() >= skipTarget) return;
    stage.classList.add('is-instant');
    reach(skipTarget, skipTarget);
    startedAt = performance.now() - skipTarget * 1000;
    drawUnderline(skipTarget);
    void stage.offsetWidth;
    stage.classList.remove('is-instant');
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') skip();
  }

  // The underline is laid out per rendered line, so it follows both reflow and a language change.
  const resizeObserver = new ResizeObserver(layoutUnderline);
  const textObserver = new MutationObserver(layoutUnderline);
  if (passage) {
    resizeObserver.observe(passage);
    textObserver.observe(passage, { characterData: true, childList: true, subtree: true });
  }
  stage.addEventListener('keydown', onKeyDown);
  layoutUnderline();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) skip();
  frame = requestAnimationFrame(tick);

  return {
    dispose() {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      textObserver.disconnect();
      stage.removeEventListener('keydown', onKeyDown);
      music?.stop();
    },
    setMuted: (muted) => music?.setMuted(muted),
    skip,
  };
}
