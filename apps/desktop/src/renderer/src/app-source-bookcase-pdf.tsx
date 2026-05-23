import { lazy, Suspense } from 'react';
import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceBookcaseProps } from './app-source-bookcase-shared';

const PdfiumBookcase = lazy(() =>
  import('./app-source-bookcase-pdfium').then((module) => ({
    default: module.PdfiumBookcase,
  })),
);

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
