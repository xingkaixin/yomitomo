// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleReadingProgress } from '@yomitomo/shared';
import { useSourceReadingProgressSaver } from '../source/bookcase/use-source-reading-progress-saver';

type SourceReadingProgressSaver = ReturnType<typeof useSourceReadingProgressSaver>;
type ScrollReadingProgress = Extract<ArticleReadingProgress, { kind: 'scroll' }>;

const now = '2026-06-28T00:00:00.000Z';

let latestSaver: SourceReadingProgressSaver | null = null;

afterEach(() => {
  cleanup();
  latestSaver = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

function progress(overrides: Partial<ScrollReadingProgress> = {}): ScrollReadingProgress {
  return {
    kind: 'scroll',
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
}: {
  articleId?: string;
  debounceMs?: number;
  initialProgress?: ArticleReadingProgress;
  onSave: (articleId: string, progress: ArticleReadingProgress) => Promise<void> | void;
}) {
  latestSaver = useSourceReadingProgressSaver({
    articleId,
    debounceMs,
    initialProgress,
    onSaveArticleReadingProgress: onSave,
  });
  return null;
}

describe('useSourceReadingProgressSaver', () => {
  it('saves the previous article progress and resets for the next article', () => {
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
    act(() => {
      vi.advanceTimersByTime(450);
    });

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
      progress: 'scroll:0.2',
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

  it('persists a return to the saved position after an in-flight move succeeds', async () => {
    const firstSave = deferred<void>();
    const onSave = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);
    render(<Probe initialProgress={progress({ progress: 0.1 })} onSave={onSave} />);

    let drain!: Promise<void>;
    act(() => {
      void saver().saveNow(progress({ progress: 0.7 }));
      drain = saver().saveNow(progress({ progress: 0.1 }));
    });
    await act(async () => {
      firstSave.resolve();
      await drain;
    });

    expect(onSave.mock.calls.map((call) => call[1].progress)).toEqual([0.7, 0.1]);
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
