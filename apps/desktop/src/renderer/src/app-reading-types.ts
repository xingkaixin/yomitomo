import type { ArticleRecord } from '@yomitomo/shared';

export type ArticleUpdater = (article: ArticleRecord) => ArticleRecord | null;

export type EbookImportProgressCallback = (progress: number) => void;

export type PromptArticle = {
  title: string;
  url: string;
  byline?: string;
  text: string;
  ebookIndex?: NonNullable<ArticleRecord['ebook']>['index'];
  ebookMetadata?: NonNullable<ArticleRecord['ebook']>['metadata'];
};
