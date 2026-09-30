import { useCallback, useEffect, useRef, useState } from 'react';
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

export function usePdfiumDocumentText({
  articleId,
  currentPageIndex,
  document,
  engine,
  openTrace,
}: {
  articleId: string;
  currentPageIndex: number;
  document: PdfiumLoadedDocument | undefined;
  engine: PdfEngine;
  openTrace: PdfOpenTrace;
}) {
  const pageTextCacheRef = useRef(new Map<number, { promise: Promise<string>; text?: string }>());
  const pdfTextDocumentRef = useRef<PdfTextDocument | null>(null);
  const fullTextDocumentPromiseRef = useRef<Promise<PdfTextDocument> | null>(null);
  const currentPageIndexRef = useRef(currentPageIndex);
  const textExtractionGenerationRef = useRef(0);
  const [pdfTextDocument, setPdfTextDocument] = useState<PdfTextDocument | null>(null);
  const [pdfFirstPageReady, setPdfFirstPageReady] = useState(false);
  const [pdfTextIndexPreparing, setPdfTextIndexPreparing] = useState(false);

  useEffect(
    () => () => {
      textExtractionGenerationRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    currentPageIndexRef.current = currentPageIndex;
  }, [currentPageIndex]);

  const commitPdfTextDocument = useCallback((textDocument: PdfTextDocument | null) => {
    pdfTextDocumentRef.current = textDocument;
    setPdfTextDocument(textDocument);
  }, []);

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

  const ensurePdfTextDocument = useCallback(async () => {
    const existingTextDocument = pdfTextDocumentRef.current;
    if (existingTextDocument) return existingTextDocument;
    if (!document) return buildPdfTextDocument([]);

    const pendingTextDocument = fullTextDocumentPromiseRef.current;
    if (pendingTextDocument) return pendingTextDocument;

    const generation = textExtractionGenerationRef.current;
    const pageCount = document.pages.length;
    const orderedPageIndexes = pdfTextExtractionOrder(pageCount, currentPageIndexRef.current);
    const textExtractStartedAt = performance.now();
    setPdfTextIndexPreparing(true);
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
          commitPdfTextDocument(nextTextDocument);
          setPdfTextIndexPreparing(false);
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
          commitPdfTextDocument(null);
          setPdfTextIndexPreparing(false);
          recordPdfOpenTiming(openTrace, 'text_extract_error', {
            durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
            pageCount,
          });
        }
        throw error;
      });

    fullTextDocumentPromiseRef.current = textDocumentPromise;
    return textDocumentPromise;
  }, [commitPdfTextDocument, document, extractPdfiumPageText, openTrace]);

  const cachedPdfiumPageText = useCallback(
    (pageIndex: number) => pageTextCacheRef.current.get(pageIndex)?.text,
    [],
  );

  const currentArticleText = useCallback(async () => {
    const existingTextDocument = pdfTextDocumentRef.current;
    if (existingTextDocument) return existingTextDocument.text;
    if (!document) return '';
    const textDocument = await ensurePdfTextDocument();
    return textDocument.text;
  }, [document, ensurePdfTextDocument]);

  const resetPdfiumTextDocument = useCallback(() => {
    textExtractionGenerationRef.current += 1;
    pageTextCacheRef.current = new Map();
    fullTextDocumentPromiseRef.current = null;
    setPdfFirstPageReady(false);
    setPdfTextIndexPreparing(false);
    commitPdfTextDocument(null);
  }, [commitPdfTextDocument]);

  const markPdfiumFirstPageReady = useCallback(() => {
    setPdfFirstPageReady(true);
  }, []);

  useEffect(() => {
    if (!document) {
      textExtractionGenerationRef.current += 1;
      pageTextCacheRef.current = new Map();
      fullTextDocumentPromiseRef.current = null;
      setPdfFirstPageReady(false);
      setPdfTextIndexPreparing(false);
      commitPdfTextDocument(null);
      return;
    }
    if (!pdfFirstPageReady) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const generation = textExtractionGenerationRef.current;
      void extractPdfTextPages({
        extractPageText: extractPdfiumPageText,
        isCurrent: () => !cancelled && textExtractionGenerationRef.current === generation,
        orderedPageIndexes: pdfTextExtractionOrder(document.pages.length, currentPageIndex, true),
        pageCount: document.pages.length,
      }).catch(() => undefined);
    }, PDF_TEXT_EXTRACT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    articleId,
    commitPdfTextDocument,
    currentPageIndex,
    document,
    extractPdfiumPageText,
    pdfFirstPageReady,
  ]);

  return {
    cachedPdfiumPageText,
    currentArticleText,
    ensurePdfTextDocument,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfFirstPageReady,
    pdfTextIndexPreparing,
    pdfTextDocument,
    resetPdfiumTextDocument,
  };
}
