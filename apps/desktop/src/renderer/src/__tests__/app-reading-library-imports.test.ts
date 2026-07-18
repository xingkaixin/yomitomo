import { describe, expect, it } from 'vitest';
import {
  articleImportErrorMessage,
  fileImportErrorMessage,
} from '../reading-library/app-reading-library-imports';

describe('article import errors', () => {
  it('maps import boundary failures to specific message keys', () => {
    expect(articleImportErrorMessage(new Error('ARTICLE_IMPORT_REQUEST_FAILED'), keyT)).toBe(
      'library.import.article.requestFailed',
    );
    expect(
      articleImportErrorMessage(new Error('ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE'), keyT),
    ).toBe('library.import.article.unsupportedContentType');
    expect(articleImportErrorMessage(new Error('ARTICLE_IMPORT_RESPONSE_TOO_LARGE'), keyT)).toBe(
      'library.import.article.responseTooLarge',
    );
    expect(articleImportErrorMessage(new Error('ARTICLE_IMPORT_TIMEOUT'), keyT)).toBe(
      'library.import.article.timeout',
    );
    expect(
      articleImportErrorMessage(new Error('ARTICLE_IMPORT_BLOCKED_NETWORK_TARGET'), keyT),
    ).toBe('library.import.article.blockedNetworkTarget');
  });

  it('falls back to the generic article import error for unknown errors', () => {
    expect(articleImportErrorMessage(new Error('UNKNOWN'), keyT)).toBe(
      'library.import.article.errorTitle',
    );
  });
});

describe('file import errors', () => {
  it('maps ebook decompressed entry failures to a specific message key', () => {
    expect(
      fileImportErrorMessage(new Error('EBOOK_IMPORT_ENTRY_TOO_LARGE'), 'fallback', fileKeyT),
    ).toBe('library.import.ebook.entryTooLarge');
  });
});

const keyT = ((key: string) => key) as Parameters<typeof articleImportErrorMessage>[1];

const fileKeyT = ((key: string) => key) as Parameters<typeof fileImportErrorMessage>[2];
