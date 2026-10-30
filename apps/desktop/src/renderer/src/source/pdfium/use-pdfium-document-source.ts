import {
  createElement,
  use,
  useCallback,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import devPdfiumWasmUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import type { ArticleRecord } from '@yomitomo/shared';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import i18next from 'i18next';
import { rendererPerformanceElapsedMs } from '../../shell/app-renderer-performance';
import { getDesktopApi } from '../../shell/app-desktop-api';
import {
  pdfiumFontFallback,
  pdfOpenTrace,
  recordPdfOpenTiming,
  recordPdfOpenTimingOnce,
} from './app-source-bookcase-pdfium-open-trace';

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export type PdfiumEngineSource = ReturnType<typeof usePdfiumEngineSource>;

type PdfFileState = { buffer: ArrayBuffer | null; loadError: string };

function pdfFileReducer(
  _state: PdfFileState,
  event: { type: 'fileRead'; buffer: ArrayBuffer } | { type: 'fileReadFailed'; message: string },
): PdfFileState {
  return event.type === 'fileRead'
    ? { buffer: event.buffer, loadError: '' }
    : { buffer: null, loadError: event.message };
}

export function usePdfiumEngineSource() {
  const wasmUrl = import.meta.env.DEV
    ? devPdfiumWasmUrl
    : use(getDesktopApi().app.readPdfiumWasmUrl());
  return usePdfiumEngine({
    wasmUrl: new URL(wasmUrl, window.location.href).href,
    worker: true,
    fontFallback: pdfiumFontFallback,
  });
}

export function usePdfiumDocumentSource(
  article: PdfArticleRecord,
  { engine, error: engineError, isLoading }: PdfiumEngineSource,
) {
  const openTrace = useMemo(() => pdfOpenTrace(article.id), []);
  const recordedOpenPhasesRef = useRef(new Set<string>());
  const [{ buffer, loadError }, dispatch] = useReducer(pdfFileReducer, {
    buffer: null,
    loadError: '',
  });
  const readEngineState = useEffectEvent(() => ({ engine, engineError, isLoading }));

  useMountEffect(() => {
    let cancelled = false;
    const fileReadStartedAt = performance.now();
    recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'open_requested', {
      fileSize: article.pdf.metadata.fileSize,
      pageCount: article.pdf.metadata.pageCount,
    });
    recordPdfOpenTiming(openTrace, 'file_read_start', {
      fileSize: article.pdf.metadata.fileSize,
    });

    void getDesktopApi()
      .article.pdf.readFile(article.id)
      .then((data) => {
        if (!cancelled) {
          dispatch({ type: 'fileRead', buffer: data });
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
          dispatch({ type: 'fileReadFailed', message });
          recordPdfOpenTiming(openTrace, 'file_read_error', {
            durationMs: rendererPerformanceElapsedMs(fileReadStartedAt),
            message,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  });

  const recordEngineState = useCallback(
    (marker: HTMLElement | null) => {
      if (!marker) return;
      const state = readEngineState();
      if (state.engineError) {
        recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_error', {
          message: state.engineError.message,
        });
      } else if (state.engine && !state.isLoading) {
        recordPdfOpenTimingOnce(recordedOpenPhasesRef, openTrace, 'engine_init_done');
      }
    },
    [openTrace],
  );
  const engineStatus = engineError ? 'error' : engine && !isLoading ? 'ready' : 'loading';

  return {
    buffer,
    engine,
    engineError,
    isLoading,
    loadError,
    marker: createElement('span', { hidden: true, key: engineStatus, ref: recordEngineState }),
    openTrace,
  };
}

function pdfReadErrorMessage(error: unknown) {
  if (!(error instanceof Error) || !error.message) return i18next.t('pdfReader.readFailed');
  if (error.message === 'PDF_SOURCE_FILE_MISSING') return i18next.t('pdfReader.sourceMissing');
  if (error.message === 'PDF_SOURCE_INVALID_ID') return i18next.t('pdfReader.readFailed');
  return error.message;
}
