import type { ArticleRecord } from '@yomitomo/shared';

export type ArticleUpdater = (article: ArticleRecord) => ArticleRecord | null;

export type EbookImportProgressCallback = (progress: number) => void;

export type PdfImportProgressCallback = (progress: number) => void;

export type PromptArticle = {
  id?: string;
  title: string;
  url: string;
  byline?: string;
  text: string;
  ebookIndex?: NonNullable<ArticleRecord['ebook']>['index'];
  ebookMetadata?: NonNullable<ArticleRecord['ebook']>['metadata'];
};
