import { describe, expect, it } from 'vitest';
import { DesktopIpcError } from '../../../ipc-errors';
import {
  articleImportErrorMessage,
  fileImportBatchProgress,
  fileImportErrorMessage,
  runFileImportQueue,
} from '../reading-library/app-reading-library-imports';

describe('article import errors', () => {
  it('maps import boundary failures to specific message keys', () => {
    expect(
      articleImportErrorMessage(new DesktopIpcError('ARTICLE_IMPORT_REQUEST_FAILED'), keyT),
    ).toBe('library.import.article.requestFailed');
    expect(
      articleImportErrorMessage(
        new DesktopIpcError('ARTICLE_IMPORT_UNSUPPORTED_CONTENT_TYPE'),
        keyT,
      ),
    ).toBe('library.import.article.unsupportedContentType');
    expect(
      articleImportErrorMessage(new DesktopIpcError('ARTICLE_IMPORT_RESPONSE_TOO_LARGE'), keyT),
    ).toBe('library.import.article.responseTooLarge');
    expect(articleImportErrorMessage(new DesktopIpcError('ARTICLE_IMPORT_TIMEOUT'), keyT)).toBe(
      'library.import.article.timeout',
    );
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
      fileImportErrorMessage(
        new DesktopIpcError('EBOOK_IMPORT_ENTRY_TOO_LARGE'),
        'fallback',
        fileKeyT,
      ),
    ).toBe('library.import.ebook.entryTooLarge');
  });

  it('does not expose unknown internal error messages', () => {
    expect(fileImportErrorMessage(new Error('database path leaked'), 'fallback', fileKeyT)).toBe(
      'fallback',
    );
  });
});

describe('file import queue', () => {
  it('caps concurrent imports', async () => {
    const limits = { maxConcurrent: 2, maxInFlightBytes: 100 };
    const { finish, started, queue } = startQueue([1, 2, 3], limits);

    expect(started).toEqual([1, 2]);
    finish(2);
    await settle();
    expect(started).toEqual([1, 2, 3]);
    finish(1);
    finish(3);
    await queue;
  });

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

  it('reports batch progress as the share of all importable files', () => {
    const rejected = { progress: 0 };
    const items = [{ progress: 100 }, { progress: 50 }, { progress: 0 }, { progress: 50 }];

    expect(fileImportBatchProgress([...items, rejected], items.length)).toBe(50);
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

const keyT = ((key: string) => key) as Parameters<typeof articleImportErrorMessage>[1];

const fileKeyT = ((key: string) => key) as Parameters<typeof fileImportErrorMessage>[2];
