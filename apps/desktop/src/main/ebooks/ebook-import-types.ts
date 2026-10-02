import type { ArticleRecord } from '@yomitomo/shared';
import type { SourceImportErrorCode } from '../../ipc/article-import-boundary';

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

export type EbookImportWorkerResult = (
  | { ok: true; article: ImportedEbookArticle }
  | { ok: false; code: SourceImportErrorCode }
) & { timings: { event: string; data?: Record<string, unknown> }[] };
