import { useEffect, useRef, useState } from 'react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import pdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import type { ArticleRecord } from '@yomitomo/shared';
import i18next from 'i18next';
import { rendererPerformanceElapsedMs } from '../bookcase/app-source-bookcase-shared';
import {
  pdfiumFontFallback,
  pdfOpenTrace,
  recordPdfOpenTiming,
  recordPdfOpenTimingOnce,
} from './app-source-bookcase-pdfium-open-trace';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export function usePdfiumDocumentSource(article: PdfArticleRecord) {
  const openTraceRef = useRef(pdfOpenTrace(article.id));
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState('');
  if (openTraceRef.current.articleId !== article.id) {
    openTraceRef.current = pdfOpenTrace(article.id);
    recordedOpenPhasesRef.current = new Set();
  }
  const openTrace = openTraceRef.current;
  const {
    engine,
    error: engineError,
    isLoading,
  } = usePdfiumEngine({
    wasmUrl: pdfiumWasmUrl,
    worker: false,
    fontFallback: pdfiumFontFallback,
  });

  useEffect(() => {
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'open_requested', {
      fileSize: article.pdf.metadata.fileSize,
      pageCount: article.pdf.metadata.pageCount,
    });
  }, [article.id, article.pdf.metadata.fileSize, article.pdf.metadata.pageCount, openTrace]);

  useEffect(() => {
    if (!engine || isLoading) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_done');
  }, [engine, isLoading, openTrace]);

  useEffect(() => {
    if (!engineError) return;
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_error', {
      message: engineError.message,
    });
  }, [engineError, openTrace]);

  useEffect(() => {
    let cancelled = false;
    const fileReadStartedAt = performance.now();
    setBuffer(null);
    setLoadError('');
    recordPdfOpenTiming(openTrace, 'file_read_start', {
      fileSize: article.pdf.metadata.fileSize,
    });

    void window.yomitomoDesktop
      .readPdfFile(article.id)
      .then((data) => {
        if (!cancelled) {
          setBuffer(data);
          recordPdfOpenTiming(openTrace, 'file_read_done', {
            byteLength: data.byteLength,
            copyDurationMs: 0,
            durationMs: rendererPerformanceElapsedMs(fileReadStartedAt),
            ipcByteLength: data.byteLength,
            rendererCopiedBuffer: false,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          const message = pdfReadErrorMessage(error);
          setLoadError(message);
          recordPdfOpenTiming(openTrace, 'file_read_error', {
            durationMs: rendererPerformanceElapsedMs(fileReadStartedAt),
            message,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [article.id, article.pdf.metadata.fileSize, openTrace]);

  return {
    buffer,
    engine,
    engineError,
    isLoading,
    loadError,
    openTrace,
  };
}

function pdfReadErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return i18next.t('pdfReader.readFailed');
  if (error.message === 'PDF_SOURCE_FILE_MISSING') return i18next.t('pdfReader.sourceMissing');
  if (error.message === 'PDF_SOURCE_INVALID_ID') return i18next.t('pdfReader.readFailed');
  return error.message;
}
