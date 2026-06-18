import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfEngine } from '@embedpdf/models';
import type { useDocumentState } from '@embedpdf/core/react';
import { rendererPerformanceElapsedMs } from '../bookcase/app-source-bookcase-shared';
import { buildPdfTextDocument, type PdfTextDocument } from './app-source-bookcase-pdfium-utils';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';

type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

const PDF_TEXT_EXTRACT_DELAY_MS = 120;
const PDF_TEXT_EXTRACT_CONCURRENCY = 2;
const PDF_TEXT_PREFETCH_RADIUS = 1;

function pdfTextExtractionOrder(pageCount: number, currentPageIndex: number) {
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
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    addPageIndex(pageIndex);
  }

  return pageIndexes;
}

async function extractPdfTextPages({
  extractPageText,
  orderedPageIndexes,
  pageCount,
}: {
  extractPageText: (pageIndex: number) => Promise<string>;
  orderedPageIndexes: number[];
  pageCount: number;
}) {
  const pageTexts = Array.from({ length: pageCount }, () => '');
  let cursor = 0;
  const workerCount = Math.min(PDF_TEXT_EXTRACT_CONCURRENCY, orderedPageIndexes.length);

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (cursor < orderedPageIndexes.length) {
        const pageIndex = orderedPageIndexes[cursor];
        cursor += 1;
        if (pageIndex === undefined) continue;
        pageTexts[pageIndex] = await extractPageText(pageIndex);
      }
    }),
  );

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
  const pageTextCacheRef = useRef(new Map<number, Promise<string>>());
  const pdfTextDocumentRef = useRef<PdfTextDocument | null>(null);
  const fullTextDocumentPromiseRef = useRef<Promise<PdfTextDocument> | null>(null);
  const currentPageIndexRef = useRef(currentPageIndex);
  const textExtractionGenerationRef = useRef(0);
  const [pdfTextDocument, setPdfTextDocument] = useState<PdfTextDocument | null>(null);
  const [pdfFirstPageReady, setPdfFirstPageReady] = useState(false);

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
      if (cached) return cached;
      const text = engine.extractText(document, [pageIndex]).toPromise();
      pageTextCacheRef.current.set(pageIndex, text);
      return text;
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
    const textDocumentPromise = extractPdfTextPages({
      extractPageText: extractPdfiumPageText,
      orderedPageIndexes,
      pageCount,
    })
      .then((pageTexts) => {
        const nextTextDocument = buildPdfTextDocument(pageTexts);
        if (textExtractionGenerationRef.current === generation) {
          commitPdfTextDocument(nextTextDocument);
        }
        return nextTextDocument;
      })
      .catch((error: unknown) => {
        if (textExtractionGenerationRef.current === generation) {
          fullTextDocumentPromiseRef.current = null;
          commitPdfTextDocument(null);
        }
        throw error;
      });

    fullTextDocumentPromiseRef.current = textDocumentPromise;
    return textDocumentPromise;
  }, [commitPdfTextDocument, document, extractPdfiumPageText]);

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
      commitPdfTextDocument(null);
      return;
    }
    if (!pdfFirstPageReady) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      const textExtractStartedAt = performance.now();
      recordPdfOpenTiming(openTrace, 'text_extract_start', {
        pageCount: document.pageCount,
      });
      ensurePdfTextDocument()
        .then((textDocument) => {
          if (!cancelled) {
            recordPdfOpenTiming(openTrace, 'text_extract_done', {
              durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
              pageCount: textDocument.pages.length,
              textChars: textDocument.text.length,
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPdfTextDocument(null);
            recordPdfOpenTiming(openTrace, 'text_extract_error', {
              durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
              pageCount: document.pageCount,
            });
          }
        });
    }, PDF_TEXT_EXTRACT_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    articleId,
    commitPdfTextDocument,
    document,
    ensurePdfTextDocument,
    openTrace,
    pdfFirstPageReady,
  ]);

  return {
    currentArticleText,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfFirstPageReady,
    pdfTextIndexPreparing: Boolean(document && pdfFirstPageReady && !pdfTextDocument),
    pdfTextDocument,
    resetPdfiumTextDocument,
  };
}
