import { lazy, Suspense } from 'react';
import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';

const PdfEmbedPdfSpikeBookcase = lazy(() =>
  import('./app-source-bookcase-pdf-embedpdf-spike').then((module) => ({
    default: module.PdfEmbedPdfSpikeBookcase,
  })),
);

type PdfArticleRecord = ArticleRecord & { pdf: NonNullable<ArticleRecord['pdf']> };

export function PdfBookcase({
  article,
  ...props
}: SourceBookcaseProps & { article: PdfArticleRecord }) {
  return (
    <Suspense fallback={<section className="source-bookcase source-pdf-reader-shell" />}>
      <PdfEmbedPdfSpikeBookcase {...props} article={article} />
    </Suspense>
  );
}
