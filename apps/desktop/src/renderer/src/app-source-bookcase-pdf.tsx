import { lazy, Suspense } from 'react';
import type { ArticleRecord } from '@yomitomo/shared';
import {
  recordRendererPerformanceTiming,
  rendererPerformanceElapsedMs,
  type SourceBookcaseProps,
} from './app-source-bookcase-shared';

const PdfiumBookcase = lazy(() => {
  const startedAt = performance.now();
  return import('./app-source-bookcase-pdfium').then((module) => {
    recordRendererPerformanceTiming('pdf.reader_chunk_ready', {
      durationMs: rendererPerformanceElapsedMs(startedAt),
    });
    return { default: module.PdfiumBookcase };
  });
});

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export function PdfBookcase({
  article,
  ...props
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  return (
    <Suspense fallback={<section className="source-bookcase source-pdf-reader-shell" />}>
      <PdfiumBookcase {...props} article={article} />
    </Suspense>
  );
}
