import { FontCharset } from '@embedpdf/models';
import {
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
} from '../bookcase/app-source-bookcase-shared';
import notoSansScRegularUrl from './assets/fonts/NotoSansSC-Regular.ttf?url';

export type PdfOpenTrace = {
  articleId: string;
  startedAt: number;
};

export const pdfiumFontFallback = {
  fonts: {
    [FontCharset.GB2312]: notoSansScRegularUrl,
    [FontCharset.CHINESEBIG5]: notoSansScRegularUrl,
  },
};

export function pdfOpenTrace(articleId: string): PdfOpenTrace {
  return { articleId, startedAt: performance.now() };
}

export function recordPdfOpenTiming(
  trace: PdfOpenTrace,
  phase: string,
  data: Record<string, unknown> = {},
) {
  recordRendererPerformanceTiming('pdf.open', {
    articleId: trace.articleId,
    elapsedMs: rendererPerformanceElapsedMs(trace.startedAt),
    phase,
    ...data,
  });
}

export function recordPdfOpenTimingOnce(
  recordedPhases: { current: Set<string> },
  trace: PdfOpenTrace,
  phase: string,
  data: Record<string, unknown> = {},
) {
  if (recordedPhases.current.has(phase)) return;
  recordedPhases.current.add(phase);
  recordPdfOpenTiming(trace, phase, data);
}
