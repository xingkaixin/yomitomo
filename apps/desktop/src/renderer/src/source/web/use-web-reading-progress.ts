import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
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
  const restoredArticleRef = useRef<string | null>(null);
  const [progress] = useState(() =>
    createReadingProgressSource(normalizeSavedProgress(initialProgress) ?? 0),
  );
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

  useEffect(() => {
    progress.set(normalizeSavedProgress(initialProgress) ?? 0);
    restoredArticleRef.current = null;
  }, [articleId]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement || restoredArticleRef.current === articleId) return;
    const savedProgress = normalizeSavedProgress(initialProgress);
    if (savedProgress === null || savedProgress <= 0) {
      restoredArticleRef.current = articleId;
      return;
    }

    let cancelled = false;
    const restore = () => {
      if (cancelled) return;
      const maxScrollTop = webReaderMaxScrollTop(scrollElement);
      if (maxScrollTop > 0) scrollElement.scrollTo({ top: maxScrollTop * savedProgress });
      progress.set(savedProgress);
      restoredArticleRef.current = articleId;
    };
    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [articleId, initialProgress, progress, scrollRef]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return;

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
      scrollElement.removeEventListener('scroll', saveProgress);
      if (initialFrame !== null) window.cancelAnimationFrame(initialFrame);
      progressFrame.cancel();
    };
  }, [articleId, progress, saveNow, scheduleSave, scrollRef]);

  return progress;
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
