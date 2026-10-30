import { createElement, useCallback, useEffectEvent, useMemo, useRef, type RefObject } from 'react';
import type { ArticleReadingProgress } from '@yomitomo/shared';
import {
  useSourceReadingProgressSaver,
  type SourceReadingProgressSave,
} from '../bookcase/use-source-reading-progress-saver';
import { createWebReadingProgressFrame } from './web-reading-progress-frame';

const SAVE_DEBOUNCE_MS = 450;
const SAVE_MIN_DELTA = 0.01;

export function useWebReadingProgress({
  articleId,
  initialProgress,
  onSaveArticleReadingProgress,
  scrollRef,
}: {
  articleId: string;
  initialProgress: ArticleReadingProgress | undefined;
  onSaveArticleReadingProgress: SourceReadingProgressSave;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  // The reader remounts per article, so the progress source lives as long as this view.
  const progress = useMemo(
    () => createReadingProgressSource(normalizeSavedProgress(initialProgress) ?? 0),
    [],
  );
  const restoredRef = useRef(false);
  const readInitialProgress = useEffectEvent(() => initialProgress);
  const shouldSave = useCallback(
    (next: ArticleReadingProgress, saved: ArticleReadingProgress | null) =>
      next.kind === 'scroll' &&
      (saved?.kind !== 'scroll' || Math.abs(next.progress - saved.progress) >= SAVE_MIN_DELTA),
    [],
  );
  const { saveNow, scheduleSave } = useSourceReadingProgressSaver({
    articleId,
    debounceMs: SAVE_DEBOUNCE_MS,
    initialProgress,
    onSaveArticleReadingProgress,
    shouldSave,
  });

  const attachScrollElement = useCallback(
    (marker: HTMLElement | null) => {
      const scrollElement = scrollRef.current;
      if (!marker || !scrollElement) return;

      let cancelled = false;
      let restoreFrame: number | null = null;
      const savedProgress = normalizeSavedProgress(readInitialProgress());
      if (savedProgress === null || savedProgress <= 0) restoredRef.current = true;
      else if (!restoredRef.current) {
        const restore = () => {
          if (cancelled) return;
          const maxScrollTop = webReaderMaxScrollTop(scrollElement);
          if (maxScrollTop > 0) scrollElement.scrollTo({ top: maxScrollTop * savedProgress });
          progress.set(savedProgress);
          restoredRef.current = true;
        };
        restoreFrame = window.requestAnimationFrame(() => {
          restoreFrame = window.requestAnimationFrame(restore);
        });
      }

      const progressFrame = createWebReadingProgressFrame(progress.set);
      const updateProgress = () => {
        const nextProgress = webReaderProgress(scrollElement);
        progressFrame.schedule(nextProgress);
        return nextProgress;
      };
      const saveProgress = () => {
        scheduleSave(webReadingProgressSnapshot(updateProgress()));
      };

      let initialFrame: number | null = null;
      initialFrame = window.requestAnimationFrame(() => {
        initialFrame = window.requestAnimationFrame(() => {
          initialFrame = null;
          const nextProgress = webReaderProgress(scrollElement);
          progress.set(nextProgress);
          if (webReaderMaxScrollTop(scrollElement) <= 0) {
            void saveNow(webReadingProgressSnapshot(nextProgress));
          }
        });
      });
      scrollElement.addEventListener('scroll', saveProgress, { passive: true });
      return () => {
        cancelled = true;
        if (restoreFrame !== null) window.cancelAnimationFrame(restoreFrame);
        scrollElement.removeEventListener('scroll', saveProgress);
        if (initialFrame !== null) window.cancelAnimationFrame(initialFrame);
        progressFrame.cancel();
      };
    },
    [progress, saveNow, scheduleSave, scrollRef],
  );

  return {
    marker: createElement('span', { hidden: true, ref: attachScrollElement }),
    progress,
  };
}

function createReadingProgressSource(initialValue: number) {
  let value = initialValue;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    set: (nextValue: number) => {
      if (nextValue === value) return;
      value = nextValue;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function normalizeSavedProgress(progress: ArticleReadingProgress | undefined) {
  if (progress?.kind !== 'scroll' || !Number.isFinite(progress.progress)) return null;
  return Math.min(1, Math.max(0, progress.progress));
}

function webReaderMaxScrollTop(scrollElement: HTMLElement) {
  return Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
}

function webReaderProgress(scrollElement: HTMLElement) {
  const maxScrollTop = webReaderMaxScrollTop(scrollElement);
  return maxScrollTop > 0 ? Math.min(1, Math.max(0, scrollElement.scrollTop / maxScrollTop)) : 1;
}

function webReadingProgressSnapshot(progress: number): ArticleReadingProgress {
  return {
    kind: 'scroll',
    progress,
    updatedAt: new Date().toISOString(),
  };
}
