import type { ArticleRecord } from '@yomitomo/shared';

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type EbookImportOptions = {
  performanceLogger?: (event: string, data?: Record<string, unknown>) => void;
};

export type ImportedEbookArticle = Extract<ArticleRecord, { sourceType: 'ebook' }> & {
  legacyId: string;
};
