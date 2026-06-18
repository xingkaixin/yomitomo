import { Buffer } from 'node:buffer';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import type { EbookFormat } from '@yomitomo/shared';

const EBOOK_SOURCE_EXTENSIONS: EbookFormat[] = ['epub', 'azw3', 'mobi'];

function ebookDirectory() {
  return join(app.getPath('userData'), 'ebooks');
}

function ebookFilePath(articleId: string, format: EbookFormat = 'epub') {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('EBOOK_SOURCE_INVALID_ID');
  return join(ebookDirectory(), `${safeId}.${format}`);
}

export async function saveEbookSourceFile(
  articleId: string,
  data: ArrayBuffer,
  format: EbookFormat = 'epub',
) {
  await mkdir(ebookDirectory(), { recursive: true });
  await writeFile(ebookFilePath(articleId, format), Buffer.from(data));
}

export async function readEbookSourceFile(articleId: string) {
  let lastMissingError: unknown;
  for (const format of EBOOK_SOURCE_EXTENSIONS) {
    try {
      return await readFile(ebookFilePath(articleId, format));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      lastMissingError = error;
    }
  }
  throw new Error('EBOOK_SOURCE_FILE_MISSING', { cause: lastMissingError });
}

export async function deleteEbookSourceFile(articleId: string) {
  await Promise.all(
    EBOOK_SOURCE_EXTENSIONS.map((format) =>
      rm(ebookFilePath(articleId, format), {
        force: true,
      }),
    ),
  );
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
