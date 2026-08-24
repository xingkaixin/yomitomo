import type { ArticleRecord, ArticleUpsertPatch } from '@yomitomo/shared';

export type ArticleImportResult =
  | { status: 'canceled' }
  | { status: 'duplicate'; article: ArticleRecord }
  | { status: 'imported'; article: ArticleRecord; patch: ArticleUpsertPatch };

export const sourceImportErrorCodes = [
  'ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET',
  'ARTICLE_IMPORT_CANCELED',
  'ARTICLE_IMPORT_CHALLENGE_BLOCKED',
  'ARTICLE_IMPORT_DNS_ADDRESS_UNAVAILABLE',
  'ARTICLE_IMPORT_INVALID_TASK',
  'ARTICLE_IMPORT_INVALID_URL',
  'ARTICLE_IMPORT_PARSE_FAILED',
  'ARTICLE_IMPORT_PROXY_INVALID_REQUEST',
  'ARTICLE_IMPORT_PROXY_START_FAILED',
  'ARTICLE_IMPORT_RENDER_EMPTY',
  'ARTICLE_IMPORT_REQUEST_FAILED',
  'ARTICLE_IMPORT_RESPONSE_TOO_LARGE',
  'ARTICLE_IMPORT_TIMEOUT',
  'ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE',
  'ARTICLE_IMPORT_UNSUPPORTED_PROTOCOL',
  'ARTICLE_IMPORT_WORKER_EXITED',
  'EBOOK_IMPORT_DRM_PROTECTED',
  'EBOOK_IMPORT_ENTRY_TOO_LARGE',
  'EBOOK_IMPORT_FILE_TOO_LARGE',
  'EBOOK_IMPORT_INVALID_CDIC',
  'EBOOK_IMPORT_INVALID_FILE',
  'EBOOK_IMPORT_INVALID_HUFF',
  'EBOOK_IMPORT_MISSING_CONTAINER',
  'EBOOK_IMPORT_MISSING_OPF',
  'EBOOK_IMPORT_NO_READABLE_CHAPTERS',
  'EBOOK_IMPORT_OPF_UNREADABLE',
  'EBOOK_IMPORT_UNSUPPORTED_COMPRESSION',
  'PDF_IMPORT_FILE_TOO_LARGE',
  'PDF_IMPORT_INVALID_FILE',
] as const;

export type SourceImportErrorCode = (typeof sourceImportErrorCodes)[number];

const sourceImportErrorCodeSet = new Set<string>(sourceImportErrorCodes);

export class SourceImportError extends Error {
  readonly importCode: SourceImportErrorCode;

  constructor(code: SourceImportErrorCode, options: { cause?: unknown } = {}) {
    super(code, options);
    this.name = 'SourceImportError';
    this.importCode = code;
  }
}

export function isSourceImportErrorCode(value: unknown): value is SourceImportErrorCode {
  return typeof value === 'string' && sourceImportErrorCodeSet.has(value);
}

export function isSourceImportError(error: unknown): error is SourceImportError {
  return (
    error instanceof Error && 'importCode' in error && isSourceImportErrorCode(error.importCode)
  );
}

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
