import { useCallback, useEffect, useRef } from 'react';
import type { ArticleReadingProgress } from '@yomitomo/shared';

export type SourceReadingProgressSavePredicate = (
  nextProgress: ArticleReadingProgress,
  lastSavedProgress: ArticleReadingProgress | null,
) => boolean;

export type SourceReadingProgressSave = (
  articleId: string,
  progress: ArticleReadingProgress,
) => Promise<void> | void;

export function sourceReadingProgressSaveKey(progress: ArticleReadingProgress) {
  switch (progress.kind) {
    case 'scroll':
      return `scroll:${progress.progress}`;
    case 'page':
      return `page:${progress.pageIndex}:${progress.pageCount}`;
    case 'chapter':
      return `chapter:${progress.chapterIndex}:${progress.chapterProgress}:${progress.bookProgress}`;
  }
}

export function normalizeSourceReadingProgress(
  progress: ArticleReadingProgress,
): ArticleReadingProgress {
  const updatedAt = progress.updatedAt || new Date().toISOString();
  switch (progress.kind) {
    case 'scroll':
      return {
        kind: 'scroll',
        progress: normalizeRatio(progress.progress),
        updatedAt,
      };
    case 'page':
      return {
        kind: 'page',
        pageIndex: normalizeIndex(progress.pageIndex),
        pageCount: normalizeCount(progress.pageCount),
        updatedAt,
      };
    case 'chapter':
      return {
        kind: 'chapter',
        chapterIndex: normalizeIndex(progress.chapterIndex),
        chapterProgress: normalizeRatio(progress.chapterProgress),
        bookProgress: normalizeRatio(progress.bookProgress),
        updatedAt,
      };
  }
}

function normalizeIndex(value: number) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeCount(value: number) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeRatio(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function shouldSaveSourceReadingProgress(
  nextProgress: ArticleReadingProgress,
  lastSavedProgress: ArticleReadingProgress | null,
) {
  if (!lastSavedProgress) return true;
  return (
    sourceReadingProgressSaveKey(nextProgress) !== sourceReadingProgressSaveKey(lastSavedProgress)
  );
}

function normalizeInitialProgress(progress: ArticleReadingProgress | undefined) {
  return progress ? normalizeSourceReadingProgress(progress) : null;
}

type SourceReadingProgressSaveRuntime = {
  onSave: SourceReadingProgressSave;
  shouldSave: SourceReadingProgressSavePredicate;
};

type SourceReadingProgressSaveState = {
  articleId: string;
  lastPersistedProgress: ArticleReadingProgress | null;
  pendingProgress: ArticleReadingProgress | null;
  saveTimer: number | undefined;
  drainPromise: Promise<void> | null;
  retryBlocked: boolean;
  runtime: SourceReadingProgressSaveRuntime;
};

function createSourceReadingProgressSaveState(
  articleId: string,
  initialProgress: ArticleReadingProgress | undefined,
  runtime: SourceReadingProgressSaveRuntime,
): SourceReadingProgressSaveState {
  return {
    articleId,
    lastPersistedProgress: normalizeInitialProgress(initialProgress),
    pendingProgress: null,
    saveTimer: undefined,
    drainPromise: null,
    retryBlocked: false,
    runtime,
  };
}

function clearSourceReadingProgressSaveTimer(state: SourceReadingProgressSaveState) {
  if (state.saveTimer === undefined) return;
  window.clearTimeout(state.saveTimer);
  state.saveTimer = undefined;
}

function queueSourceReadingProgress(
  state: SourceReadingProgressSaveState,
  progress: ArticleReadingProgress,
) {
  // An in-flight save can replace the persisted value before this progress is drained.
  if (!state.drainPromise && !state.runtime.shouldSave(progress, state.lastPersistedProgress)) {
    state.pendingProgress = null;
    return false;
  }
  state.pendingProgress = progress;
  return true;
}

function sameSourceReadingProgress(left: ArticleReadingProgress, right: ArticleReadingProgress) {
  return sourceReadingProgressSaveKey(left) === sourceReadingProgressSaveKey(right);
}

async function drainSourceReadingProgress(state: SourceReadingProgressSaveState) {
  while (state.pendingProgress && state.saveTimer === undefined) {
    const progress = state.pendingProgress;
    if (!state.runtime.shouldSave(progress, state.lastPersistedProgress)) {
      state.pendingProgress = null;
      continue;
    }

    state.pendingProgress = null;
    try {
      await state.runtime.onSave(state.articleId, progress);
      state.lastPersistedProgress = progress;
    } catch (error) {
      console.warn('[reading-progress] save failed', {
        articleId: state.articleId,
        error,
        progress: sourceReadingProgressSaveKey(progress),
      });
      if (!state.pendingProgress || sameSourceReadingProgress(state.pendingProgress, progress)) {
        state.pendingProgress ||= progress;
        state.retryBlocked = true;
      }
    }

    if (state.retryBlocked || state.saveTimer !== undefined) return;
  }
}

function requestSourceReadingProgressDrain(state: SourceReadingProgressSaveState) {
  state.retryBlocked = false;
  if (state.drainPromise) return state.drainPromise;

  const drainPromise = drainSourceReadingProgress(state).finally(() => {
    if (state.drainPromise !== drainPromise) return;
    state.drainPromise = null;
    if (state.pendingProgress && state.saveTimer === undefined && !state.retryBlocked) {
      void requestSourceReadingProgressDrain(state);
    }
  });
  state.drainPromise = drainPromise;
  return drainPromise;
}

function flushSourceReadingProgress(state: SourceReadingProgressSaveState) {
  clearSourceReadingProgressSaveTimer(state);
  if (!state.pendingProgress) return state.drainPromise || Promise.resolve();
  return requestSourceReadingProgressDrain(state);
}

export function useSourceReadingProgressSaver({
  articleId,
  debounceMs = 450,
  initialProgress,
  onSaveArticleReadingProgress,
  shouldSave = shouldSaveSourceReadingProgress,
}: {
  articleId: string;
  debounceMs?: number;
  initialProgress: ArticleReadingProgress | undefined;
  onSaveArticleReadingProgress: SourceReadingProgressSave;
  shouldSave?: SourceReadingProgressSavePredicate;
}) {
  const runtimeRef = useRef<SourceReadingProgressSaveRuntime>({
    onSave: onSaveArticleReadingProgress,
    shouldSave,
  });
  runtimeRef.current.onSave = onSaveArticleReadingProgress;
  runtimeRef.current.shouldSave = shouldSave;
  const initialProgressRef = useRef(initialProgress);
  initialProgressRef.current = initialProgress;
  const stateRef = useRef(
    createSourceReadingProgressSaveState(articleId, initialProgress, runtimeRef.current),
  );

  useEffect(() => {
    let state = stateRef.current;
    if (state.articleId !== articleId) {
      state = createSourceReadingProgressSaveState(
        articleId,
        initialProgressRef.current,
        runtimeRef.current,
      );
      stateRef.current = state;
    }
    return () => {
      void flushSourceReadingProgress(state);
    };
  }, [articleId]);

  const saveNow = useCallback((progress: ArticleReadingProgress) => {
    const state = stateRef.current;
    clearSourceReadingProgressSaveTimer(state);
    if (!queueSourceReadingProgress(state, normalizeSourceReadingProgress(progress))) {
      return state.drainPromise || Promise.resolve();
    }
    return requestSourceReadingProgressDrain(state);
  }, []);

  const scheduleSave = useCallback(
    (progress: ArticleReadingProgress) => {
      const normalizedProgress = normalizeSourceReadingProgress(progress);
      const state = stateRef.current;
      clearSourceReadingProgressSaveTimer(state);
      if (!queueSourceReadingProgress(state, normalizedProgress)) return;
      if (debounceMs <= 0) {
        void requestSourceReadingProgressDrain(state);
        return;
      }
      state.saveTimer = window.setTimeout(() => {
        state.saveTimer = undefined;
        void requestSourceReadingProgressDrain(state);
      }, debounceMs);
    },
    [debounceMs],
  );

  return { saveNow, scheduleSave };
}
