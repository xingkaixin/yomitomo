import { useCallback, useEffect, useRef, useState } from 'react';
import type { PdfEngine } from '@embedpdf/models';
import { useDocumentState } from '@embedpdf/core/react';
import { rendererPerformanceElapsedMs } from '../bookcase/app-source-bookcase-shared';
import { buildPdfTextDocument, type PdfTextDocument } from './app-source-bookcase-pdfium-utils';
import { recordPdfOpenTiming, type PdfOpenTrace } from './app-source-bookcase-pdfium-open-trace';

type PdfiumLoadedDocument = NonNullable<
  NonNullable<ReturnType<typeof useDocumentState>>['document']
>;

export function usePdfiumDocumentText({
  articleId,
  document,
  engine,
  openTrace,
}: {
  articleId: string;
  document: PdfiumLoadedDocument | undefined;
  engine: PdfEngine;
  openTrace: PdfOpenTrace;
}) {
  const pageTextCacheRef = useRef(new Map<number, Promise<string>>());
  const [pdfTextDocument, setPdfTextDocument] = useState<PdfTextDocument | null>(null);
  const [pdfFirstPageReady, setPdfFirstPageReady] = useState(false);

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

  const currentArticleText = useCallback(async () => {
    if (pdfTextDocument) return pdfTextDocument.text;
    if (!document) return '';
    const texts = await Promise.all(
      document.pages.map((_page, pageIndex) => extractPdfiumPageText(pageIndex)),
    );
    return buildPdfTextDocument(texts).text;
  }, [document, extractPdfiumPageText, pdfTextDocument]);

  const resetPdfiumTextDocument = useCallback(() => {
    pageTextCacheRef.current = new Map();
    setPdfFirstPageReady(false);
    setPdfTextDocument(null);
  }, []);

  const markPdfiumFirstPageReady = useCallback(() => {
    setPdfFirstPageReady(true);
  }, []);

  useEffect(() => {
    if (!document) {
      setPdfTextDocument(null);
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
      Promise.all(document.pages.map((_page, pageIndex) => extractPdfiumPageText(pageIndex)))
        .then((pageTexts) => {
          if (!cancelled) {
            setPdfTextDocument(buildPdfTextDocument(pageTexts));
            recordPdfOpenTiming(openTrace, 'text_extract_done', {
              durationMs: rendererPerformanceElapsedMs(textExtractStartedAt),
              pageCount: pageTexts.length,
              textChars: pageTexts.reduce((count, text) => count + text.length, 0),
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
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [articleId, document, extractPdfiumPageText, openTrace, pdfFirstPageReady]);

  return {
    currentArticleText,
    extractPdfiumPageText,
    markPdfiumFirstPageReady,
    pdfFirstPageReady,
    pdfTextDocument,
    resetPdfiumTextDocument,
  };
}
