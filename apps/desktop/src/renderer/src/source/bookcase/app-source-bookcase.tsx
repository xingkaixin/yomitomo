import { lazy, Suspense } from 'react';
import type { ArticleRecord } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import type {
  EbookArticleRecord,
  PdfArticleRecord,
  SourceBookcaseProps,
} from './source-bookcase-types';

export type {
  EbookArticleRecord,
  EbookBookcaseProps,
  SourceBookcaseProps,
  WebSourceBookcaseProps,
} from './source-bookcase-types';

const EbookBookcase = lazy(() =>
  import('../ebook/app-source-bookcase-ebook').then((module) => ({
    default: module.EbookBookcase,
  })),
);
const PdfBookcase = lazy(() =>
  import('../pdfium/app-source-bookcase-pdf').then((module) => ({
    default: module.PdfBookcase,
  })),
);
const WebSourceBookcase = lazy(() =>
  import('../web/app-source-bookcase-web').then((module) => ({
    default: module.WebSourceBookcase,
  })),
);

export function SourceBookcase(props: SourceBookcaseProps) {
  const { t } = useTranslation();
  const article = props.content.article;
  if (!article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">{t('source.empty')}</div>
      </section>
    );
  }

  if (isEbookArticle(article)) {
    return (
      <Suspense fallback={null}>
        <EbookBookcase {...props} content={{ ...props.content, article }} />
      </Suspense>
    );
  }

  if (isPdfArticle(article)) {
    return (
      <Suspense fallback={null}>
        <PdfBookcase {...props} content={{ ...props.content, article }} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <WebSourceBookcase {...props} content={{ ...props.content, article }} />
    </Suspense>
  );
}

export function isEbookArticle(article: ArticleRecord | null): article is EbookArticleRecord {
  return article?.sourceType === 'ebook' && Boolean(article.ebook.chapters.length);
}

export function isPdfArticle(article: ArticleRecord | null): article is PdfArticleRecord {
  return article?.sourceType === 'pdf' && Boolean(article.pdf);
}
