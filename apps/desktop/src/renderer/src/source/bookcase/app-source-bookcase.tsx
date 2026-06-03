import type { ArticleRecord } from '@yomitomo/shared';
import { EbookBookcase } from '../ebook/app-source-bookcase-ebook';
import { PdfBookcase } from '../pdfium/app-source-bookcase-pdf';
import type { EbookArticleRecord, SourceBookcaseProps } from './app-source-bookcase-shared';
import { WebSourceBookcase } from '../web/app-source-bookcase-web';

export function SourceBookcase(props: SourceBookcaseProps) {
  if (!props.article) {
    return (
      <section className="source-bookcase is-empty">
        <div className="source-empty">选择一篇文章查看原文</div>
      </section>
    );
  }

  if (isEbookArticle(props.article)) {
    return <EbookBookcase {...props} article={props.article} />;
  }

  if (isPdfArticle(props.article)) {
    return <PdfBookcase {...props} article={props.article} />;
  }

  return <WebSourceBookcase {...props} article={props.article} />;
}

export function isEbookArticle(article: ArticleRecord | null): article is EbookArticleRecord {
  return article?.sourceType === 'ebook' && Boolean(article.ebook?.chapters.length);
}

export function isPdfArticle(article: ArticleRecord | null): article is ArticleRecord & {
  pdf: NonNullable<ArticleRecord['pdf']>;
} {
  return article?.sourceType === 'pdf' && Boolean(article.pdf);
}
