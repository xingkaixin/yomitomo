import type { ArticleRecord } from '@yomitomo/shared';

export type EbookImportProgressCallback = (progress: number) => void;

export type PdfImportProgressCallback = (progress: number) => void;

export type ReadingEvidenceSourceTarget = {
  articleId: string;
  annotationId?: string;
  view?: 'source' | 'discussion';
};

export type PromptArticle = {
  id?: string;
  title: string;
  url: string;
  byline?: string;
  text: string;
  ebookIndex?: NonNullable<ArticleRecord['ebook']>['index'];
  ebookMetadata?: NonNullable<ArticleRecord['ebook']>['metadata'];
};
