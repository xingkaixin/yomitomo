import { describe, expect, it } from 'vitest';
import {
  articleImportErrorKey,
  fileImportErrorKey,
  fileImportErrorMessage,
  runFileImportQueue,
} from '../reading-library/app-reading-library-imports';
import { enResources } from '../i18n/locales/en';
import { jaResources } from '../i18n/locales/ja';
import { zhCNResources } from '../i18n/locales/zh-CN';

describe('file import errors', () => {
  it('does not expose unknown internal error messages', () => {
    expect(fileImportErrorMessage(new Error('database path leaked'), 'fallback', fileKeyT)).toBe(
      'fallback',
    );
  });

  it('maps backend article and ebook import error codes to localized messages in all locales', () => {
    const articleCodes = [
      'ARTICLE_IMPORT_INVALID_URL',
      'ARTICLE_IMPORT_UNSUPPORTED_PROTOCOL',
      'ARTICLE_IMPORT_REQUEST_FAILED',
      'ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE',
      'ARTICLE_IMPORT_RESPONSE_TOO_LARGE',
      'ARTICLE_IMPORT_TIMEOUT',
      'ARTICLE_IMPORT_CHALLENGE_BLOCKED',
      'ARTICLE_IMPORT_RENDER_EMPTY',
    ];
    const fileCodes = [
      'EBOOK_IMPORT_INVALID_FILE',
      'EBOOK_IMPORT_FILE_TOO_LARGE',
      'EBOOK_IMPORT_ENTRY_TOO_LARGE',
      'EBOOK_IMPORT_NO_READABLE_CHAPTERS',
      'EBOOK_IMPORT_MISSING_CONTAINER',
      'EBOOK_IMPORT_MISSING_OPF',
      'EBOOK_IMPORT_OPF_UNREADABLE',
      'EBOOK_IMPORT_DRM_PROTECTED',
      'EBOOK_IMPORT_UNSUPPORTED_COMPRESSION',
      'EBOOK_IMPORT_TIMEOUT',
      'EBOOK_IMPORT_INVALID_HUFF',
      'EBOOK_IMPORT_INVALID_CDIC',
      'PDF_IMPORT_INVALID_FILE',
      'PDF_IMPORT_FILE_TOO_LARGE',
    ];

    for (const code of articleCodes) {
      const key = articleImportErrorKey(code);
      expect(key).not.toBe('');
      expect(lookupLocaleValue(zhCNResources.app, key)).toBeTruthy();
      expect(lookupLocaleValue(enResources.app, key)).toBeTruthy();
      expect(lookupLocaleValue(jaResources.app, key)).toBeTruthy();
    }

    for (const code of fileCodes) {
      const key = fileImportErrorKey(code);
      expect(key).not.toBe('');
      expect(lookupLocaleValue(zhCNResources.app, key)).toBeTruthy();
      expect(lookupLocaleValue(enResources.app, key)).toBeTruthy();
      expect(lookupLocaleValue(jaResources.app, key)).toBeTruthy();
    }
  });
});

describe('file import queue', () => {
  it('keeps selection order and runs an oversized file alone', async () => {
    const limits = { maxConcurrent: 3, maxInFlightBytes: 100 };
    const { finish, started, queue } = startQueue([10, 20, 80, 30, 200], limits);

    expect(started).toEqual([10, 20]);
    finish(20);
    await settle();
    expect(started).toEqual([10, 20, 80]);
    finish(10);
    await settle();
    expect(started).toEqual([10, 20, 80]);
    finish(80);
    await settle();
    expect(started).toEqual([10, 20, 80, 30]);
    finish(30);
    await settle();
    expect(started).toEqual([10, 20, 80, 30, 200]);
    finish(200);
    await queue;
  });
});

function startQueue(sizes: number[], limits: Parameters<typeof runFileImportQueue>[1]) {
  const started: number[] = [];
  const pending = new Map<number, () => void>();
  const queue = runFileImportQueue(
    sizes.map((size) => ({ file: { size } })),
    limits,
    ({ file }) => {
      started.push(file.size);
      return new Promise<void>((resolve) => pending.set(file.size, resolve));
    },
  );
  return { finish: (size: number) => pending.get(size)?.(), started, queue };
}

function settle() {
  return new Promise((resolve) => setTimeout(resolve));
}

const fileKeyT = ((key: string) => key) as Parameters<typeof fileImportErrorMessage>[2];

function lookupLocaleValue(root: Record<string, unknown>, key: string) {
  let current: unknown = root;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}
