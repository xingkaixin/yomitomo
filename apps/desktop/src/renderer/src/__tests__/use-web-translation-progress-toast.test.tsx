// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import type { ArticleTranslation } from '@yomitomo/shared';
import { appToast } from '../shell/app-toast';
import { useWebTranslationProgressToast } from '../source/web/use-web-translation-progress-toast';

vi.mock('../shell/app-toast', () => ({
  appToast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../shell/app-assistant-runtime-progress', () => ({
  assistantRuntimeErrorMessage: vi.fn((error: unknown, fallbackKey: string) =>
    error instanceof Error ? error.message : fallbackKey,
  ),
}));

type TranslationProgressToast = ReturnType<typeof useWebTranslationProgressToast>;

const now = '2026-06-30T00:00:00.000Z';
const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key) as TFunction;

let latestToast: TranslationProgressToast | null = null;

afterEach(() => {
  cleanup();
  latestToast = null;
  vi.useRealTimers();
  vi.clearAllMocks();
});

function toast() {
  if (!latestToast) throw new Error('translation progress toast hook not rendered');
  return latestToast;
}

function Probe({
  onRevealFirstFailedTranslationSegment = vi.fn(),
}: {
  onRevealFirstFailedTranslationSegment?: (nextTranslation: ArticleTranslation) => void;
}) {
  latestToast = useWebTranslationProgressToast({
    onRevealFirstFailedTranslationSegment,
    t,
  });
  return null;
}

function translation(overrides: Partial<ArticleTranslation> = {}): ArticleTranslation {
  return {
    id: 'translation-1',
    articleId: 'article-1',
    sourceId: 'article',
    sourceContentHash: 'hash-1',
    targetLanguage: 'zh-CN',
    promptVersion: 1,
    status: 'translating',
    segments: [
      translationSegment('segment-1', 'ready'),
      translationSegment('segment-2', 'translating'),
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function translationSegment(
  id: string,
  status: ArticleTranslation['segments'][number]['status'],
): ArticleTranslation['segments'][number] {
  return {
    id,
    translationId: 'translation-1',
    sourceBlockId: `block-${id}`,
    sourceTextHash: `hash-${id}`,
    sourceText: `source ${id}`,
    status,
    order: Number(id.replace('segment-', '')),
    createdAt: now,
    updatedAt: now,
  };
}

describe('useWebTranslationProgressToast', () => {
  it('dismisses the old toast and creates a pending toast on start', () => {
    vi.mocked(appToast.info).mockReturnValueOnce('toast-1').mockReturnValueOnce('toast-2');
    render(<Probe />);

    act(() => {
      toast().start();
      toast().start();
    });

    expect(appToast.dismiss).toHaveBeenCalledWith('toast-1');
    expect(appToast.info).toHaveBeenLastCalledWith('source.translatingArticle', {
      description: expect.objectContaining({
        props: expect.objectContaining({
          className: 'translation-toast-progress is-pending',
        }),
      }),
      duration: Infinity,
      timing: { displayDuration: 24 * 60 * 60 * 1000 },
    });
  });

  it('updates only the current toast while translation is in progress', () => {
    vi.mocked(appToast.info).mockReturnValue('toast-1');
    render(<Probe />);

    act(() => {
      toast().update(translation());
    });
    expect(appToast.update).not.toHaveBeenCalled();

    act(() => {
      toast().start();
      toast().update(translation({ status: 'ready' }));
    });
    expect(appToast.update).not.toHaveBeenCalled();

    act(() => {
      toast().update(translation());
    });
    expect(appToast.update).toHaveBeenCalledWith('toast-1', {
      description: expect.objectContaining({
        props: expect.objectContaining({
          className: 'translation-toast-progress',
        }),
      }),
      title: 'source.translatingArticle',
      type: 'info',
    });
  });

  it('finishes successful translations and dismisses after 6000ms', () => {
    vi.useFakeTimers();
    vi.mocked(appToast.info).mockReturnValue('toast-1');
    render(<Probe />);

    act(() => {
      toast().start();
      toast().finish(
        translation({
          status: 'ready',
          segments: [
            translationSegment('segment-1', 'ready'),
            translationSegment('segment-2', 'ready'),
          ],
        }),
      );
      vi.advanceTimersByTime(5_999);
    });

    expect(appToast.update).toHaveBeenCalledWith('toast-1', {
      action: undefined,
      description: 'source.translationCompleteToastDescription:{"ready":2,"total":2}',
      title: 'source.translationCompleteToast',
      type: 'success',
    });
    expect(appToast.dismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(appToast.dismiss).toHaveBeenCalledWith('toast-1');
  });

  it('finishes translations with failures and dismisses after 12000ms', () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const nextTranslation = translation({
      status: 'failed',
      segments: [
        translationSegment('segment-1', 'ready'),
        translationSegment('segment-2', 'failed'),
      ],
    });
    vi.mocked(appToast.info).mockReturnValue('toast-1');
    render(<Probe onRevealFirstFailedTranslationSegment={onReveal} />);

    act(() => {
      toast().start();
      toast().finish(nextTranslation);
      vi.advanceTimersByTime(11_999);
    });

    const updateOptions = vi.mocked(appToast.update).mock.calls[0]?.[1];
    expect(updateOptions).toEqual({
      action: {
        label: 'source.translationFailedToastAction',
        onClick: expect.any(Function),
        successLabel: 'source.translationFailedToastActionDone',
      },
      description:
        'source.translationCompleteWithFailuresDescription:{"failed":1,"ready":1,"total":2}',
      title: 'source.translationCompleteWithFailuresToast:{"failed":1}',
      type: 'warning',
    });
    updateOptions?.action?.onClick();
    expect(onReveal).toHaveBeenCalledWith(nextTranslation);
    expect(appToast.dismiss).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(appToast.dismiss).toHaveBeenCalledWith('toast-1');
  });

  it('shows an error toast when fail has no current toast id', () => {
    render(<Probe />);

    act(() => {
      toast().fail(new Error('translation failed'));
    });

    expect(appToast.error).toHaveBeenCalledWith('translation failed');
    expect(appToast.update).not.toHaveBeenCalled();
  });

  it('dismiss clears the pending timer and dismisses the current toast', () => {
    vi.useFakeTimers();
    vi.mocked(appToast.info).mockReturnValue('toast-1');
    render(<Probe />);

    act(() => {
      toast().start();
      toast().finish(
        translation({ status: 'ready', segments: [translationSegment('1', 'ready')] }),
      );
    });
    vi.mocked(appToast.dismiss).mockClear();

    act(() => {
      toast().dismiss();
      vi.advanceTimersByTime(6_000);
    });

    expect(appToast.dismiss).toHaveBeenCalledTimes(1);
    expect(appToast.dismiss).toHaveBeenCalledWith('toast-1');
  });
});
