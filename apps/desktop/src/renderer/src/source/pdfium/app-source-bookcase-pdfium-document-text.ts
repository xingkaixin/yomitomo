import { createElement, useCallback, useEffectEvent, useReducer, useRef } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import type { PdfEngine } from '@embedpdf/models';
import type { useDocumentState } from '@embedpdf/core/react';
import { rendererPerformanceElapsedMs } from '../../shell/app-renderer-performance';
import { buildPdfTextDocument, type PdfTextDocument } from './pdfium-text-document';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';

type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

const PDF_TEXT_EXTRACT_DELAY_MS = 120;
const PDF_TEXT_EXTRACT_CONCURRENCY = 2;
const PDF_TEXT_PREFETCH_RADIUS = 1;

function pdfTextExtractionOrder(pageCount: number, currentPageIndex: number, prefetchOnly = false) {
  const pageIndexes: number[] = [];
  const seen = new Set<number>();
  const normalizedCurrentPageIndex =
    Number.isFinite(currentPageIndex) && pageCount > 0
      ? Math.min(Math.max(Math.trunc(currentPageIndex), 0), pageCount - 1)
      : 0;

  const addPageIndex = (pageIndex: number) => {
    if (pageIndex < 0 || pageIndex >= pageCount || seen.has(pageIndex)) return;
    seen.add(pageIndex);
    pageIndexes.push(pageIndex);
  };

  addPageIndex(normalizedCurrentPageIndex);
  for (let offset = 1; offset <= PDF_TEXT_PREFETCH_RADIUS; offset += 1) {
    addPageIndex(normalizedCurrentPageIndex - offset);
    addPageIndex(normalizedCurrentPageIndex + offset);
  }
  if (prefetchOnly) return pageIndexes;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    addPageIndex(pageIndex);
  }

  return pageIndexes;
}

async function extractPdfTextPages({
  extractPageText,
  isCurrent,
  orderedPageIndexes,
  pageCount,
}: {
  extractPageText: (pageIndex: number) => Promise<string>;
  isCurrent: () => boolean;
  orderedPageIndexes: number[];
  pageCount: number;
}) {
  const pageTexts = Array.from({ length: pageCount }, () => '');
  let cursor = 0;
  const workerCount = Math.min(PDF_TEXT_EXTRACT_CONCURRENCY, orderedPageIndexes.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < orderedPageIndexes.length) {
        if (!isCurrent()) throw new DOMException('PDF text extraction cancelled', 'AbortError');
        const pageIndex = orderedPageIndexes[cursor];
        cursor += 1;
        if (pageIndex === undefined) continue;
        pageTexts[pageIndex] = await extractPageText(pageIndex);
      }
    }),
  );

  if (!isCurrent()) throw new DOMException('PDF text extraction cancelled', 'AbortError');
  return pageTexts;
}

type PdfTextState = {
  firstPageReady: boolean;
  textDocument: PdfTextDocument | null;
  textIndexPreparing: boolean;
};

type PdfTextEvent =
  | { type: 'firstPageShown' }
  | { type: 'textExtractionStarted' }
  | { type: 'textExtractionFinished'; textDocument: PdfTextDocument }
  | { type: 'textExtractionFailed' };

function pdfTextReducer(state: PdfTextState, event: PdfTextEvent): PdfTextState {
  switch (event.type) {
    case 'firstPageShown':
      return state.firstPageReady ? state : { ...state, firstPageReady: true };
    case 'textExtractionStarted':
      return { ...state, textIndexPreparing: true };
    case 'textExtractionFinished':
      return { ...state, textDocument: event.textDocument, textIndexPreparing: false };
    case 'textExtractionFailed':
      return { ...state, textDocument: null, textIndexPreparing: false };
  }
}

export function usePdfiumDocumentText({
  currentPageIndex,
  document,
  engine,
  openTrace,
}: {
  currentPageIndex: number;
  document: PdfiumLoadedDocument | undefined;
  engine: PdfEngine;
  openTrace: PdfOpenTrace;
}) {
  const pageTextCacheRef = useRef(new Map<number, { promise: Promise<string>; text?: string }>());
  const pdfTextDocumentRef = useRef<PdfTextDocument | null>(null);
  const fullTextDocumentPromiseRef = useRef<Promise<PdfTextDocument> | null>(null);
  const textExtractionGenerationRef = useRef(0);
  const [
    {
      firstPageReady: pdfFirstPageReady,
      textDocument: pdfTextDocument,
      textIndexPreparing: pdfTextIndexPreparing,
    },
    dispatch,
  ] = useReducer(pdfTextReducer, {
    firstPageReady: false,
    textDocument: null,
    textIndexPreparing: false,
  });

  useMountEffect(() => () => {
    textExtractionGenerationRef.current += 1;
  });

  const extractPdfiumPageText = useCallback(
    async (pageIndex: number) => {
      if (!document) return '';
      const cached = pageTextCacheRef.current.get(pageIndex);
      if (cached) return cached.promise;
      const entry: { promise: Promise<string>; text?: string } = {
        promise: engine.extractText(document, [pageIndex]).toPromise(),
      };
      entry.promise = entry.promise.then(
        (text) => {
          entry.text = text;
          return text;
        },
        (error: unknown) => {
          if (pageTextCacheRef.current.get(pageIndex) === entry) {
            pageTextCacheRef.current.delete(pageIndex);
          }
          throw error;
        },
      );
      pageTextCacheRef.current.set(pageIndex, entry);
      return entry.promise;
    },
    [document, engine],
  );

  const readPrefetchInput = useEffectEvent(() => ({
    currentPageIndex,
    document,
    extractPdfiumPageText,
  }));

  const ensurePdfTextDocument = useCallback(async () => {
    const existingTextDocument = pdfTextDocumentRef.current;
    if (existingTextDocument) return existingTextDocument;
    if (!document) return buildPdfTextDocument([]);

    const pendingTextDocument = fullTextDocumentPromiseRef.current;
    if (pendingTextDocument) return pendingTextDocument;

    const generation = textExtractionGenerationRef.current;
    const pageCount = document.pages.length;
    const orderedPageIndexes = pdfTextExtractionOrder(
      pageCount,
      readPrefetchInput().currentPageIndex,
    );
    const textExtractStartedAt = performance.now();
    dispatch({ type: 'textExtractionStarted' });
    recordPdfOpenTiming(openTrace, 'text_extract_start', { pageCount });
    const textDocumentPromise = extractPdfTextPages({
      extractPageText: extractPdfiumPageText,
      isCurrent: () => textExtractionGenerationRef.current === generation,
      orderedPageIndexes,
      pageCount,
    })
      .then((pageTexts) => {
        const nextTextDocument = buildPdfTextDocument(pageTexts);
        if (textExtractionGenerationRef.current === generation) {
          pdfTextDocumentRef.current = nextTextDocument;
          dispatch({ type: 'textExtractionFinished', textDocument: nextTextDocument });
          recordPdfOpenTiming(openTrace, 'text_extract_done', {
            durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
            pageCount,
            textChars: nextTextDocument.text.length,
          });
        }
        return nextTextDocument;
      })
      .catch((error: unknown) => {
        if (textExtractionGenerationRef.current === generation) {
          fullTextDocumentPromiseRef.current = null;
          pdfTextDocumentRef.current = null;
          dispatch({ type: 'textExtractionFailed' });
          recordPdfOpenTiming(openTrace, 'text_extract_error', {
            durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
            pageCount,
          });
        }
        throw error;
      });

    fullTextDocumentPromiseRef.current = textDocumentPromise;
    return textDocumentPromise;
  }, [document, extractPdfiumPageText, openTrace]);

  const cachedPdfiumPageText = useCallback(
    (pageIndex: number) => pageTextCacheRef.current.get(pageIndex)?.text,
    [],
  );

  const markPdfiumFirstPageReady = useCallback(() => {
    dispatch({ type: 'firstPageShown' });
  }, []);

  const prefetchNearbyPages = useCallback((marker: HTMLElement | null) => {
    const {
      currentPageIndex: prefetchPageIndex,
      document: prefetchDocument,
      extractPdfiumPageText: extractPageText,
    } = readPrefetchInput();
    if (!marker || !prefetchDocument) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const generation = textExtractionGenerationRef.current;
      void extractPdfTextPages({
        extractPageText,
        isCurrent: () => !cancelled && textExtractionGenerationRef.current === generation,
        orderedPageIndexes: pdfTextExtractionOrder(
          prefetchDocument.pages.length,
          prefetchPageIndex,
          true,
        ),
        pageCount: prefetchDocument.pages.length,
      }).catch(() => undefined);
    }, PDF_TEXT_EXTRACT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return {
    cachedPdfiumPageText,
    ensurePdfTextDocument,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfFirstPageReady,
    pdfTextIndexPreparing,
    pdfTextDocument,
    prefetchMarker:
      document && pdfFirstPageReady
        ? createElement('span', { hidden: true, key: currentPageIndex, ref: prefetchNearbyPages })
        : null,
  };
}
