// @vitest-environment jsdom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePdfiumDocumentText } from '../source/pdfium/app-source-bookcase-pdfium-document-text';

type PdfiumDocumentTextState = ReturnType<typeof usePdfiumDocumentText>;
type PdfiumDocumentTextOptions = Parameters<typeof usePdfiumDocumentText>[0];
type PdfiumLoadedDocument = NonNullable<PdfiumDocumentTextOptions['document']>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function createPdfDocument(pageCount: number): PdfiumLoadedDocument {
  return {
    pageCount,
    pages: Array.from({ length: pageCount }, () => ({
      size: { height: 800, width: 600 },
    })),
  } as PdfiumLoadedDocument;
}

async function flushMicrotasks(count = 8) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

function renderPdfiumDocumentText({
  currentPageIndex,
  document,
  engine,
}: {
  currentPageIndex: number;
  document: PdfiumLoadedDocument;
  engine: PdfiumDocumentTextOptions['engine'];
}) {
  let state: PdfiumDocumentTextState | null = null;

  function Probe() {
    state = usePdfiumDocumentText({
      articleId: 'article_1',
      currentPageIndex,
      document,
      engine,
      openTrace: { articleId: 'article_1', startedAt: performance.now() },
    });
    return null;
  }

  render(<Probe />);

  return () => {
    if (!state) throw new Error('PDFium document text hook did not render');
    return state;
  };
}

describe('usePdfiumDocumentText', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('starts the background index with a bounded current-page extraction window', async () => {
    vi.useFakeTimers();
    const document = createPdfDocument(6);
    const deferredByPageIndex = new Map<number, ReturnType<typeof createDeferred<string>>>();
    const extractText = vi.fn((_document: unknown, pageIndexes: number[]) => {
      const pageIndex = pageIndexes[0];
      if (pageIndex === undefined) throw new Error('expected one page index');
      const deferred = createDeferred<string>();
      deferredByPageIndex.set(pageIndex, deferred);
      return { toPromise: () => deferred.promise };
    });
    const state = renderPdfiumDocumentText({
      currentPageIndex: 2,
      document,
      engine: { extractText } as unknown as PdfiumDocumentTextOptions['engine'],
    });

    act(() => {
      state().markPdfiumFirstPageReady();
    });

    await act(async () => {
      await flushMicrotasks();
    });

    act(() => {
      vi.advanceTimersByTime(119);
    });

    expect(extractText).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await flushMicrotasks();
    });

    expect(extractText).toHaveBeenCalledTimes(2);
    expect(extractText.mock.calls.map((call) => call[1]?.[0])).toEqual([2, 1]);
    expect(deferredByPageIndex.has(0)).toBe(false);
    expect(deferredByPageIndex.has(3)).toBe(false);
    expect(deferredByPageIndex.has(4)).toBe(false);
    expect(deferredByPageIndex.has(5)).toBe(false);
  });

  it('builds the full PDF text document after the limited queue drains', async () => {
    vi.useFakeTimers();
    const document = createPdfDocument(4);
    const pageTexts = ['alpha', 'bravo', 'charlie', 'delta'];
    const extractText = vi.fn((_document: unknown, pageIndexes: number[]) => ({
      toPromise: () => Promise.resolve(pageTexts[pageIndexes[0] ?? 0] ?? ''),
    }));
    const state = renderPdfiumDocumentText({
      currentPageIndex: 1,
      document,
      engine: { extractText } as unknown as PdfiumDocumentTextOptions['engine'],
    });

    await act(async () => {
      state().markPdfiumFirstPageReady();
      await flushMicrotasks();
    });

    await act(async () => {
      vi.advanceTimersByTime(120);
      await flushMicrotasks();
    });

    expect(state().pdfTextDocument?.pages).toHaveLength(4);
    expect(state().pdfTextDocument?.text).toContain('alpha');
    expect(state().pdfTextDocument?.text).toContain('delta');
    expect(extractText.mock.calls.map((call) => call[1]?.[0])).toEqual([1, 0, 2, 3]);
  });
});
