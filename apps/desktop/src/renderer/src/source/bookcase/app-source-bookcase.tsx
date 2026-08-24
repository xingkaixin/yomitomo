import type { ArticleRecord } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { EbookBookcase } from '../ebook/app-source-bookcase-ebook';
import { PdfBookcase } from '../pdfium/app-source-bookcase-pdf';
import { WebSourceBookcase } from '../web/app-source-bookcase-web';
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
    return <EbookBookcase {...props} content={{ ...props.content, article }} />;
  }

  if (isPdfArticle(article)) {
    return <PdfBookcase {...props} content={{ ...props.content, article }} />;
  }

  return <WebSourceBookcase {...props} content={{ ...props.content, article }} />;
}

export function isEbookArticle(article: ArticleRecord | null): article is EbookArticleRecord {
  return article?.sourceType === 'ebook' && Boolean(article.ebook.chapters.length);
}

export function isPdfArticle(article: ArticleRecord | null): article is PdfArticleRecord {
  return article?.sourceType === 'pdf' && Boolean(article.pdf);
}
