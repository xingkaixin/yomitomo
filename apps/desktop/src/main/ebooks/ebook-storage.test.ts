import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteEbookSourceFile, readEbookSourceFile, saveEbookSourceFile } from './ebook-storage';

const testPaths = vi.hoisted(() => ({
  userData: '',
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => {
      if (name === 'userData') return testPaths.userData;
      throw new Error(`unsupported path: ${name}`);
    }),
  },
}));

describe('ebook source storage', () => {
  beforeEach(async () => {
    testPaths.userData = await mkdtemp(join(tmpdir(), 'yomitomo-ebook-storage-test-'));
  });

  afterEach(async () => {
    await rm(testPaths.userData, { recursive: true, force: true });
  });

  it('deletes a saved EPUB source file', async () => {
    const articleId = 'article-1';

    await saveEbookSourceFile(articleId, new Uint8Array([1, 2, 3]).buffer);
    await expect(readEbookSourceFile(articleId)).resolves.toEqual(Buffer.from([1, 2, 3]));

    await deleteEbookSourceFile(articleId);

    await expect(readEbookSourceFile(articleId)).rejects.toThrow('EBOOK_SOURCE_FILE_MISSING');
  });

  it('reads and deletes saved AZW3 and MOBI source files', async () => {
    await saveEbookSourceFile('article-azw3', new Uint8Array([4, 5]).buffer, 'azw3');
    await saveEbookSourceFile('article-mobi', new Uint8Array([6, 7]).buffer, 'mobi');

    await expect(readEbookSourceFile('article-azw3')).resolves.toEqual(Buffer.from([4, 5]));
    await expect(readEbookSourceFile('article-mobi')).resolves.toEqual(Buffer.from([6, 7]));

    await deleteEbookSourceFile('article-azw3');
    await deleteEbookSourceFile('article-mobi');

    await expect(readEbookSourceFile('article-azw3')).rejects.toThrow('EBOOK_SOURCE_FILE_MISSING');
    await expect(readEbookSourceFile('article-mobi')).rejects.toThrow('EBOOK_SOURCE_FILE_MISSING');
  });
});
