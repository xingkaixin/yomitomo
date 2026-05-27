import { Buffer } from 'node:buffer';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

function ebookDirectory() {
  return join(app.getPath('userData'), 'ebooks');
}

function ebookFilePath(articleId: string) {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('电子书 ID 无效');
  return join(ebookDirectory(), `${safeId}.epub`);
}

export async function saveEbookSourceFile(articleId: string, data: ArrayBuffer) {
  await mkdir(ebookDirectory(), { recursive: true });
  await writeFile(ebookFilePath(articleId), Buffer.from(data));
}

export async function readEbookSourceFile(articleId: string) {
  try {
    return await readFile(ebookFilePath(articleId));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      throw new Error('原始 EPUB 文件不存在，请重新导入', { cause: error });
    }
    throw error;
  }
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
