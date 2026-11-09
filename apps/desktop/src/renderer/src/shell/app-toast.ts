import { createStore, useStore } from 'zustand';

export type IslandTone = 'success' | 'warning' | 'error' | 'info';
export type IslandShape = 'expanded' | 'compact';

type IslandAction = {
  label: string;
  onClick: () => void;
  doneLabel?: string;
};

export type IslandProgress = {
  value: number;
  label?: string;
};

export type IslandNotice = {
  id: number;
  tone: IslandTone;
  title: string;
  description?: string;
  action?: IslandAction;
  actionDone?: boolean;
  progress?: IslandProgress;
};

type NoticeOptions = {
  description?: string;
  action?: IslandAction;
};

type ProgressOptions = {
  description?: string;
  progress: IslandProgress;
};

type IslandState = {
  // A finished result covers a running progress notice; the progress notice comes back when it ends.
  result: IslandNotice | null;
  progress: IslandNotice | null;
  shape: IslandShape;
};

const expandedHoldMs: Record<IslandTone, number> = {
  error: 6000,
  info: 2600,
  success: 2600,
  warning: 4000,
};
const actionHoldMs = 8000;
const progressIntroMs = 2200;
const compactHoldMs = 4000;
const actionDoneHoldMs = 1200;
const resumeDelayMs = 1600;

const islandStore = createStore<IslandState>(() => ({
  progress: null,
  result: null,
  shape: 'expanded',
}));

let nextNoticeId = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let scheduledStep: (() => void) | null = null;
let pausedStep: (() => void) | null = null;
let paused = false;

function clearStep() {
  clearTimeout(timer);
  timer = undefined;
  scheduledStep = null;
  pausedStep = null;
}

function scheduleStep(delayMs: number, step: () => void) {
  clearStep();
  if (paused) {
    pausedStep = step;
    return;
  }
  scheduledStep = step;
  timer = setTimeout(() => {
    timer = undefined;
    scheduledStep = null;
    step();
  }, delayMs);
}

function displayedNotice(state: IslandState) {
  return state.result ?? state.progress;
}

function expandedHold(notice: IslandNotice) {
  if (notice.progress) return progressIntroMs;
  return notice.action ? actionHoldMs : expandedHoldMs[notice.tone];
}

function showResult(notice: IslandNotice) {
  islandStore.setState({ result: notice, shape: 'expanded' });
  scheduleStep(expandedHold(notice), collapse);
}

function collapse() {
  const state = islandStore.getState();
  if (!displayedNotice(state)) return;
  islandStore.setState({ shape: 'compact' });
  if (state.result) scheduleStep(compactHoldMs, endResult);
  else clearStep();
}

function endResult() {
  clearStep();
  islandStore.setState({ result: null, shape: 'compact' });
}

function expand() {
  const notice = displayedNotice(islandStore.getState());
  if (!notice) return;
  islandStore.setState({ shape: 'expanded' });
  scheduleStep(expandedHold(notice), collapse);
}

function notify(tone: IslandTone, title: string, options: NoticeOptions = {}) {
  const id = ++nextNoticeId;
  showResult({ id, tone, title, ...options });
  return id;
}

export const appToast = {
  success: (title: string, options?: NoticeOptions) => notify('success', title, options),
  info: (title: string, options?: NoticeOptions) => notify('info', title, options),
  warning: (title: string, options?: NoticeOptions) => notify('warning', title, options),
  error: (title: string, options?: NoticeOptions) => notify('error', title, options),

  // Stays on the island until complete() or dismiss().
  progress(title: string, options: ProgressOptions) {
    const id = ++nextNoticeId;
    const notice: IslandNotice = { id, tone: 'info', title, ...options };
    const { result } = islandStore.getState();
    if (result) {
      islandStore.setState({ progress: notice });
    } else {
      islandStore.setState({ progress: notice, shape: 'expanded' });
      scheduleStep(progressIntroMs, collapse);
    }
    return id;
  },

  updateProgress(id: number, patch: Partial<ProgressOptions> & { title?: string }) {
    const { progress } = islandStore.getState();
    if (progress?.id !== id) return;
    islandStore.setState({ progress: { ...progress, ...patch } });
  },

  complete(id: number, tone: IslandTone, title: string, options: NoticeOptions = {}) {
    const { progress } = islandStore.getState();
    if (progress?.id !== id) return;
    islandStore.setState({ progress: null });
    showResult({ id, tone, title, ...options });
  },

  dismiss(id: number) {
    const { progress, result } = islandStore.getState();
    if (result?.id === id) {
      clearStep();
      islandStore.setState({ result: null, shape: 'compact' });
    } else if (progress?.id === id) {
      islandStore.setState({ progress: null });
      if (!result) clearStep();
    }
  },
};

export const islandControls = {
  pause: () => {
    if (paused) return;
    paused = true;
    const step = scheduledStep;
    if (!step) return;
    clearStep();
    pausedStep = step;
  },
  resume: () => {
    paused = false;
    const step = pausedStep;
    pausedStep = null;
    if (step) scheduleStep(resumeDelayMs, step);
  },
  toggle: () => {
    if (islandStore.getState().shape === 'compact') expand();
    else collapse();
  },
  runAction: () => {
    const { result } = islandStore.getState();
    if (!result?.action || result.actionDone) return;
    result.action.onClick();
    islandStore.setState({ result: { ...result, actionDone: true } });
    scheduleStep(actionDoneHoldMs, collapse);
  },
};

export function useIslandNotice() {
  return useStore(islandStore, displayedNotice);
}

export function useIslandShape() {
  return useStore(islandStore, (state) => state.shape);
}
