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
  onSave: (articleId: string, progress: ArticleReadingProgress) => void;
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
      saver().saveNow(progress({ progress: 0.4 }));
      vi.advanceTimersByTime(450);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('article-1', expect.objectContaining({ progress: 0.4 }));
  });
});
