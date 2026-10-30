// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import type { Annotation } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWebAnnotationFocus } from './use-web-annotation-focus';

type FocusOptions = Parameters<typeof useWebAnnotationFocus>[0];

const annotation: Annotation = {
  id: 'annotation-1',
  anchor: { exact: 'Original excerpt.', prefix: '', suffix: '', start: 0, end: 17 },
  author: { kind: 'user', username: 'reader' },
  color: '#f4c95d',
  comments: [],
  createdAt: '2026-08-30T00:00:00Z',
  updatedAt: '2026-08-30T00:00:00Z',
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useWebAnnotationFocus', () => {
  it('waits for actual navigation to succeed after layout becomes available', async () => {
    const scrollToAnnotation = vi.fn(() => true).mockReturnValueOnce(false);
    const options = focusOptions({ scrollToAnnotation, boxCount: 0 });
    renderFocus(options);

    await act(() => vi.advanceTimersToNextFrame());
    expect(options.onFocusedAnnotation).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersToNextFrame());
    expect(options.onFocusedAnnotation).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(520));

    expect(scrollToAnnotation).toHaveBeenLastCalledWith(annotation.id);
    expect(options.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reports unavailable after bounded retries even when annotation boxes exist', async () => {
    const scrollToAnnotation = vi.fn(() => false);
    const options = focusOptions({ scrollToAnnotation, boxCount: 1 });
    renderFocus(options);

    for (let frame = 0; frame < 30; frame += 1) {
      await act(() => vi.advanceTimersToNextFrame());
    }
    await act(() => vi.runOnlyPendingTimersAsync());

    expect(scrollToAnnotation).toHaveBeenCalledTimes(30);
    expect(options.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(options.onFocusedAnnotation).toHaveBeenCalledOnce();
  });

  it('reports a deleted annotation unavailable without trying to scroll', async () => {
    const options = focusOptions({ annotationsRef: { current: [] } });
    renderFocus(options);

    await act(() => vi.advanceTimersToNextFrame());

    expect(options.scrollToAnnotation).not.toHaveBeenCalled();
    expect(options.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each(['before-navigation', 'after-navigation'] as const)(
    'does not complete an unmounted focus request %s',
    async (stage) => {
      const options = focusOptions();
      const { unmount } = renderFocus(options);
      if (stage === 'after-navigation') await act(() => vi.advanceTimersToNextFrame());

      unmount();
      await act(() => vi.runOnlyPendingTimersAsync());

      expect(options.onFocusedAnnotation).not.toHaveBeenCalled();
    },
  );

  it('does not send an old completion to the next article callback', async () => {
    const previous = focusOptions();
    const { rerender } = renderFocus(previous);
    await act(() => vi.advanceTimersToNextFrame());
    const current = focusOptions({
      articleId: 'article-2',
      focusAnnotationId: 'annotation-2',
      annotationsRef: { current: [{ ...annotation, id: 'annotation-2' }] },
      scrollToAnnotation: vi.fn(() => false),
    });

    rerender(current);
    await act(() => vi.runAllTimersAsync());

    expect(previous.onFocusedAnnotation).not.toHaveBeenCalled();
    expect(current.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each(['deleted', 'changed-anchor'] as const)(
    'rechecks the same annotation after its focus target is %s',
    async (change) => {
      const previous = focusOptions();
      const { rerender } = renderFocus(previous);
      await act(() => vi.advanceTimersToNextFrame());
      previous.annotationsRef.current =
        change === 'deleted'
          ? []
          : [{ ...annotation, anchor: { ...annotation.anchor, exact: 'Replacement excerpt.' } }];
      const current = {
        ...previous,
        onFocusedAnnotation: vi.fn(),
        scrollToAnnotation: vi.fn(() => false),
      };

      rerender(current);
      await act(() => vi.runAllTimersAsync());

      expect(previous.onFocusedAnnotation).not.toHaveBeenCalled();
      expect(current.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
      if (change === 'deleted') expect(current.scrollToAnnotation).not.toHaveBeenCalled();
      else expect(current.scrollToAnnotation).toHaveBeenCalledWith(annotation.id);
    },
  );
});

function FocusProbe(options: FocusOptions) {
  return useWebAnnotationFocus(options);
}

function renderFocus(options: FocusOptions) {
  const view = render(<FocusProbe {...options} />);
  return {
    rerender: (next: FocusOptions) => view.rerender(<FocusProbe {...next} />),
    unmount: view.unmount,
  };
}

function focusOptions(overrides: Partial<FocusOptions> = {}): FocusOptions {
  return {
    annotationsRef: { current: [annotation] },
    articleId: 'article-1',
    boxCount: 1,
    focusAnnotationId: annotation.id,
    onFocusedAnnotation: vi.fn(),
    scrollRef: { current: document.createElement('div') },
    scrollToAnnotation: vi.fn(() => true),
    ...overrides,
  };
}
