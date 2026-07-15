// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleReadingProgress } from '@yomitomo/shared';
import {
  useSourceReadingProgressSaver,
  type SourceReadingProgressSavePredicate,
} from '../source/bookcase/use-source-reading-progress-saver';

type SourceReadingProgressSaver = ReturnType<typeof useSourceReadingProgressSaver>;

const now = '2026-06-28T00:00:00.000Z';
const webProgressThresholdPredicate: SourceReadingProgressSavePredicate = (next, last) =>
  !last || Math.abs(next.progress - last.progress) >= 0.01;

let latestSaver: SourceReadingProgressSaver | null = null;

afterEach(() => {
  cleanup();
  latestSaver = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

function progress(overrides: Partial<ArticleReadingProgress> = {}): ArticleReadingProgress {
  return {
    pageIndex: 1,
    pageCount: 10,
    progress: 0.1,
    updatedAt: now,
    ...overrides,
  };
}

function saver() {
  if (!latestSaver) throw new Error('reading progress saver not rendered');
  return latestSaver;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function Probe({
  articleId = 'article-1',
  debounceMs,
  initialProgress,
  onSave,
  shouldSave,
}: {
  articleId?: string;
  debounceMs?: number;
  initialProgress?: ArticleReadingProgress;
  onSave: (articleId: string, progress: ArticleReadingProgress) => Promise<void> | void;
  shouldSave?: SourceReadingProgressSavePredicate;
}) {
  latestSaver = useSourceReadingProgressSaver({
    articleId,
    debounceMs,
    initialProgress,
    onSaveArticleReadingProgress: onSave,
    shouldSave,
  });
  return null;
}

describe('useSourceReadingProgressSaver', () => {
  it('debounces and normalizes scheduled saves', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(<Probe debounceMs={450} onSave={onSave} />);

    act(() => {
      saver().scheduleSave(
        progress({
          chapterProgress: -1,
          pageCount: 0,
          pageIndex: -4,
          progress: 2,
        }),
      );
      vi.advanceTimersByTime(449);
    });

    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onSave).toHaveBeenCalledWith('article-1', {
      pageIndex: 0,
      pageCount: 1,
      chapterIndex: undefined,
      chapterProgress: 0,
      progress: 1,
      updatedAt: now,
    });
  });

  it('skips duplicate progress snapshots by default', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(
      <Probe
        initialProgress={progress({ progress: 0.5, updatedAt: '2026-06-28T01:00:00.000Z' })}
        onSave={onSave}
      />,
    );

    act(() => {
      saver().scheduleSave(progress({ progress: 0.5, updatedAt: '2026-06-28T02:00:00.000Z' }));
      vi.advanceTimersByTime(450);
    });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('lets readers keep source-specific save thresholds', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(
      <Probe
        initialProgress={progress({ progress: 0.5 })}
        onSave={onSave}
        shouldSave={webProgressThresholdPredicate}
      />,
    );

    act(() => {
      saver().scheduleSave(progress({ progress: 0.505 }));
      vi.advanceTimersByTime(450);
    });
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      saver().scheduleSave(progress({ progress: 0.52 }));
      vi.advanceTimersByTime(450);
    });
    expect(onSave).toHaveBeenCalledWith('article-1', expect.objectContaining({ progress: 0.52 }));
  });

  it('flushes pending progress on unmount and resets for the next article', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const { rerender } = render(
      <Probe articleId="article-a" initialProgress={progress({ progress: 0.1 })} onSave={onSave} />,
    );

    act(() => {
      saver().scheduleSave(progress({ progress: 0.2 }));
    });
    rerender(
      <Probe articleId="article-b" initialProgress={progress({ progress: 0.8 })} onSave={onSave} />,
    );

    expect(onSave).toHaveBeenCalledWith('article-a', expect.objectContaining({ progress: 0.2 }));
    onSave.mockClear();

    act(() => {
      saver().scheduleSave(progress({ progress: 0.8 }));
      vi.advanceTimersByTime(450);
    });
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      saver().scheduleSave(progress({ progress: 0.9 }));
      vi.advanceTimersByTime(450);
    });
    expect(onSave).toHaveBeenCalledWith('article-b', expect.objectContaining({ progress: 0.9 }));
  });

  it('clears pending debounced saves when saving immediately', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    render(<Probe debounceMs={450} onSave={onSave} />);

    act(() => {
      saver().scheduleSave(progress({ progress: 0.2 }));
      void saver().saveNow(progress({ progress: 0.4 }));
      vi.advanceTimersByTime(450);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('article-1', expect.objectContaining({ progress: 0.4 }));
  });

  it('retries the same progress after persistence fails', async () => {
    const error = new Error('database unavailable');
    const firstSave = deferred<void>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { rerender } = render(
      <Probe debounceMs={0} initialProgress={progress({ progress: 0.1 })} onSave={onSave} />,
    );

    let failedDrain!: Promise<void>;
    act(() => {
      failedDrain = saver().saveNow(progress({ progress: 0.2 }));
    });
    rerender(
      <Probe debounceMs={0} initialProgress={progress({ progress: 0.2 })} onSave={onSave} />,
    );
    await act(async () => {
      firstSave.reject(error);
      await failedDrain;
    });
    await act(async () => {
      await saver().saveNow(progress({ progress: 0.2 }));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith('[reading-progress] save failed', {
      articleId: 'article-1',
      error,
      progress: '1:10:::0.2',
    });
  });

  it('serializes progress saves and persists the latest pending value', async () => {
    const firstSave = deferred<void>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    render(<Probe debounceMs={0} onSave={onSave} />);

    let drain!: Promise<void>;
    act(() => {
      void saver().saveNow(progress({ progress: 0.2 }));
      drain = saver().saveNow(progress({ progress: 0.4 }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenLastCalledWith(
      'article-1',
      expect.objectContaining({ progress: 0.2 }),
    );

    await act(async () => {
      firstSave.resolve(undefined);
      await drain;
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      'article-1',
      expect.objectContaining({ progress: 0.4 }),
    );
  });

  it('keeps an older article save isolated after switching articles', async () => {
    const oldArticleSave = deferred<void>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => oldArticleSave.promise)
      .mockResolvedValue(undefined);
    const { rerender } = render(
      <Probe articleId="article-a" initialProgress={progress({ progress: 0.1 })} onSave={onSave} />,
    );

    act(() => {
      void saver().saveNow(progress({ progress: 0.2 }));
    });
    rerender(
      <Probe articleId="article-b" initialProgress={progress({ progress: 0.8 })} onSave={onSave} />,
    );

    await act(async () => {
      oldArticleSave.resolve(undefined);
      await oldArticleSave.promise;
    });
    await act(async () => {
      await saver().saveNow(progress({ progress: 0.8 }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      await saver().saveNow(progress({ progress: 0.9 }));
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      'article-b',
      expect.objectContaining({ progress: 0.9 }),
    );
  });

  it('flushes only the latest debounced progress on unmount', () => {
    vi.useFakeTimers();
    const onSave = vi.fn();
    const { unmount } = render(<Probe debounceMs={450} onSave={onSave} />);

    act(() => {
      saver().scheduleSave(progress({ progress: 0.2 }));
      saver().scheduleSave(progress({ progress: 0.4 }));
      unmount();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('article-1', expect.objectContaining({ progress: 0.4 }));
  });
});
