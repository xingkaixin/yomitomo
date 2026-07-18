import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';

export type ArticleImportResult =
  | { status: 'canceled' }
  | { status: 'duplicate'; article: ArticleRecord }
  | { status: 'imported'; article: ArticleRecord; patch: ArticleUpsertPatch };

export const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_IMPORT_BYTES = 120 * 1024 * 1024;
export const MAX_TEXT_IMPORT_BYTES = 20 * 1024 * 1024;
