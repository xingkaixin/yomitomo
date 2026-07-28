import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';

export type ArticleImportResult =
  | { status: 'canceled' }
  | { status: 'duplicate'; article: ArticleRecord }
  | { status: 'imported'; article: ArticleRecord; patch: ArticleUpsertPatch };

export const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;
export const MAX_PDF_IMPORT_BYTES = 120 * 1024 * 1024;
export const MAX_TEXT_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_IMPORT_FILES = 50;
// File count and batch size are independent facts: 50 files each within the per-file
// limit would still materialize close to a gigabyte across renderer and main.
export const MAX_TEXT_IMPORT_BATCH_BYTES = 64 * 1024 * 1024;
export const MAX_TEXT_IMPORT_BODY_CHARS = 20_000_000;
export const MAX_TEXT_IMPORT_BATCH_CHARS = 64_000_000;

/** Sums without ever holding an unsafe total, so a hostile payload cannot overflow past the budget. */
export function withinImportBudget(sizes: Iterable<number>, budget: number) {
  let total = 0;
  for (const size of sizes) {
    total += size;
    if (!Number.isSafeInteger(total) || total > budget) return false;
  }
  return true;
}
