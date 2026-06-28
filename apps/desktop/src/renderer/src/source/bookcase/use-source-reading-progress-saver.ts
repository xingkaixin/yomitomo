import { useCallback, useEffect, useRef } from 'react';
import type { ArticleReadingProgress } from '@yomitomo/shared';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';

export type SourceReadingProgressSavePredicate = (
  nextProgress: ArticleReadingProgress,
  lastSavedProgress: ArticleReadingProgress | null,
) => boolean;

export function sourceReadingProgressSaveKey(progress: ArticleReadingProgress) {
  return [
    progress.pageIndex,
    progress.pageCount,
    progress.chapterIndex ?? '',
    progress.chapterProgress ?? '',
    progress.progress,
  ].join(':');
}

export function normalizeSourceReadingProgress(
  progress: ArticleReadingProgress,
): ArticleReadingProgress {
  const pageIndex = progress.pageIndex;
  const pageCount = progress.pageCount;
  const chapterIndex = progress.chapterIndex;
  const chapterProgress = progress.chapterProgress;
  const progressValue = progress.progress;
  return {
    pageIndex: Number.isInteger(pageIndex) && pageIndex >= 0 ? pageIndex : 0,
    pageCount: Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 1,
    chapterIndex:
      typeof chapterIndex === 'number' && Number.isInteger(chapterIndex) && chapterIndex >= 0
        ? chapterIndex
        : undefined,
    chapterProgress:
      typeof chapterProgress === 'number' && Number.isFinite(chapterProgress)
        ? Math.max(0, Math.min(1, chapterProgress))
        : undefined,
    progress: Number.isFinite(progressValue) ? Math.max(0, Math.min(1, progressValue)) : 0,
    updatedAt: progress.updatedAt || new Date().toISOString(),
  };
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
  onSaveArticleReadingProgress: SourceBookcaseProps['onSaveArticleReadingProgress'];
  shouldSave?: SourceReadingProgressSavePredicate;
}) {
  const onSaveRef = useRef(onSaveArticleReadingProgress);
  const shouldSaveRef = useRef(shouldSave);
  const stateRef = useRef<{
    articleId: string;
    lastSavedProgress: ArticleReadingProgress | null;
    pendingProgress: ArticleReadingProgress | null;
    saveTimer: number | undefined;
  }>({
    articleId,
    lastSavedProgress: normalizeInitialProgress(initialProgress),
    pendingProgress: null,
    saveTimer: undefined,
  });

  const clearSaveTimer = useCallback(() => {
    const state = stateRef.current;
    if (state.saveTimer === undefined) return;
    window.clearTimeout(state.saveTimer);
    state.saveTimer = undefined;
  }, []);

  const saveProgress = useCallback((progress: ArticleReadingProgress) => {
    const state = stateRef.current;
    if (!shouldSaveRef.current(progress, state.lastSavedProgress)) {
      state.pendingProgress = null;
      return false;
    }

    state.lastSavedProgress = progress;
    state.pendingProgress = null;
    void onSaveRef.current(state.articleId, progress);
    return true;
  }, []);

  const flushPendingSave = useCallback(() => {
    const state = stateRef.current;
    const pendingProgress = state.pendingProgress;
    clearSaveTimer();
    if (!pendingProgress) return false;
    return saveProgress(pendingProgress);
  }, [clearSaveTimer, saveProgress]);

  useEffect(() => {
    onSaveRef.current = onSaveArticleReadingProgress;
  }, [onSaveArticleReadingProgress]);

  useEffect(() => {
    shouldSaveRef.current = shouldSave;
  }, [shouldSave]);

  useEffect(() => {
    const state = stateRef.current;
    state.articleId = articleId;
    state.lastSavedProgress = normalizeInitialProgress(initialProgress);
    state.pendingProgress = null;
    clearSaveTimer();
    return () => {
      flushPendingSave();
    };
  }, [articleId, clearSaveTimer, flushPendingSave, initialProgress]);

  const saveNow = useCallback(
    (progress: ArticleReadingProgress) => {
      clearSaveTimer();
      saveProgress(normalizeSourceReadingProgress(progress));
    },
    [clearSaveTimer, saveProgress],
  );

  const scheduleSave = useCallback(
    (progress: ArticleReadingProgress) => {
      const normalizedProgress = normalizeSourceReadingProgress(progress);
      const state = stateRef.current;
      if (!shouldSaveRef.current(normalizedProgress, state.lastSavedProgress)) {
        state.pendingProgress = null;
        clearSaveTimer();
        return;
      }

      state.pendingProgress = normalizedProgress;
      clearSaveTimer();
      if (debounceMs <= 0) {
        saveProgress(normalizedProgress);
        return;
      }
      state.saveTimer = window.setTimeout(() => {
        flushPendingSave();
      }, debounceMs);
    },
    [clearSaveTimer, debounceMs, flushPendingSave, saveProgress],
  );

  return { saveNow, scheduleSave };
}
