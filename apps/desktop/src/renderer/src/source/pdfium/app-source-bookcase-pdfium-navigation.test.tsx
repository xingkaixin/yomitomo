// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { createPdfTextAnchor, createTextAnchor, type Annotation } from '@yomitomo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdfiumNavigation } from './app-source-bookcase-pdfium-navigation';

vi.mock('@embedpdf/plugin-bookmark/react', () => ({
  useBookmarkCapability: () => ({ provides: null }),
}));

type NavigationOptions = Parameters<typeof usePdfiumNavigation>[0];

const pageText = 'Before the original excerpt. After.';
const anchor = createPdfTextAnchor({
  pageText,
  pageIndex: 1,
  start: pageText.indexOf('original'),
  end: pageText.indexOf(' After.'),
  pageWidth: 600,
  pageHeight: 800,
  rects: [{ x: 10, y: 20, width: 100, height: 16 }],
});
const annotation: Annotation = {
  id: 'pdf-annotation-1',
  anchor,
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

describe('usePdfiumNavigation focus', () => {
  it('reports success only after matching the requested excerpt in the extracted page text', async () => {
    const extraction = deferred<string>();
    const extractPageText = vi.fn(() => extraction.promise);
    const options = navigationOptions({ extractPageText });
    renderHook(usePdfiumNavigation, { initialProps: options });

    expect(options.onOpenAnnotation).toHaveBeenCalledWith(annotation.id);
    expect(options.scroll?.scrollToPage).toHaveBeenCalledWith({
      pageNumber: 2,
      behavior: 'smooth',
    });
    expect(extractPageText).toHaveBeenCalledExactlyOnceWith(1);
    expect(options.onFocusedAnnotation).not.toHaveBeenCalled();

    await act(async () => extraction.resolve(`New leading text. ${pageText}`));
    expect(options.onFocusedAnnotation).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(520));

    expect(options.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(true);
  });

  it.each(['stale-excerpt', 'invalid-page', 'deleted-annotation', 'extraction-failed'] as const)(
    'reports %s unavailable instead of treating a page or rectangle as a valid location',
    async (reason) => {
      const extractPageText = vi.fn(async () => {
        if (reason === 'extraction-failed') throw new Error('Page text extraction failed');
        return reason === 'stale-excerpt'
          ? 'This page no longer contains the quotation.'
          : pageText;
      });
      const invalidPageAnchor = { ...anchor, pageIndex: 2 };
      const options = navigationOptions({
        extractPageText,
        annotations:
          reason === 'deleted-annotation'
            ? []
            : reason === 'invalid-page'
              ? [{ ...annotation, anchor: invalidPageAnchor }]
              : [annotation],
      });
      renderHook(usePdfiumNavigation, { initialProps: options });
      await act(() => vi.runAllTimersAsync());

      expect(options.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
      if (reason === 'invalid-page' || reason === 'deleted-annotation') {
        expect(options.scroll?.scrollToPage).not.toHaveBeenCalled();
        expect(extractPageText).not.toHaveBeenCalled();
      }
    },
  );

  it('discards a previous document extraction after switching focus', async () => {
    const extraction = deferred<string>();
    const extractPageText = vi
      .fn<NavigationOptions['extractPageText']>()
      .mockReturnValueOnce(extraction.promise)
      .mockResolvedValue('The new document has no matching excerpt.');
    const previous = navigationOptions({ extractPageText });
    const { rerender } = renderHook(usePdfiumNavigation, { initialProps: previous });
    const current = {
      ...previous,
      documentId: 'document-2',
      focusAnnotationId: 'pdf-annotation-2',
      annotations: [{ ...annotation, id: 'pdf-annotation-2' }],
      onFocusedAnnotation: vi.fn(),
    };

    rerender(current);
    await act(async () => extraction.resolve(pageText));
    await act(() => vi.runAllTimersAsync());

    expect(previous.onFocusedAnnotation).not.toHaveBeenCalled();
    expect(current.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
  });

  it.each(['deleted', 'changed-anchor'] as const)(
    'discards an old extraction when the same focus target is %s',
    async (change) => {
      const extraction = deferred<string>();
      const extractPageText = vi
        .fn<NavigationOptions['extractPageText']>()
        .mockReturnValueOnce(extraction.promise)
        .mockResolvedValue(pageText);
      const previous = navigationOptions({ extractPageText });
      const { rerender } = renderHook(usePdfiumNavigation, { initialProps: previous });
      const replacementText = 'Replacement excerpt.';
      const current = {
        ...previous,
        annotations:
          change === 'deleted'
            ? []
            : [
                {
                  ...annotation,
                  anchor: {
                    ...anchor,
                    ...createTextAnchor(replacementText, 0, replacementText.length),
                  },
                },
              ],
        onFocusedAnnotation: vi.fn(),
      };

      rerender(current);
      await act(async () => extraction.resolve(pageText));
      await act(() => vi.runAllTimersAsync());

      expect(previous.onFocusedAnnotation).not.toHaveBeenCalled();
      expect(current.onFocusedAnnotation).toHaveBeenCalledExactlyOnceWith(false);
      expect(extractPageText).toHaveBeenCalledTimes(change === 'deleted' ? 1 : 2);
    },
  );

  it.each(['pending-extraction', 'pending-completion'] as const)(
    'does not complete an unmounted request with %s',
    async (stage) => {
      const extraction = deferred<string>();
      const options = navigationOptions({ extractPageText: () => extraction.promise });
      const { unmount } = renderHook(usePdfiumNavigation, { initialProps: options });
      if (stage === 'pending-completion') {
        await act(async () => extraction.resolve(pageText));
      }

      unmount();
      await act(async () => extraction.resolve(pageText));
      await act(() => vi.runAllTimersAsync());

      expect(options.onFocusedAnnotation).not.toHaveBeenCalled();
    },
  );
});

function navigationOptions(overrides: Partial<NavigationOptions> = {}): NavigationOptions {
  return {
    annotations: [annotation],
    documentId: 'document-1',
    extractPageText: vi.fn(async () => pageText),
    focusAnnotationId: annotation.id,
    pageCount: 2,
    scroll: { scrollToPage: vi.fn() },
    onCloseToc: vi.fn(),
    onFocusedAnnotation: vi.fn(),
    onOpenAnnotation: vi.fn(),
    onSetTocItems: vi.fn(),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
