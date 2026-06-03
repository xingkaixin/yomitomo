import { Buffer } from 'node:buffer';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

function thumbnailDirectory() {
  return join(app.getPath('userData'), 'assets', 'pdf-thumbs');
}

function thumbnailFilePath(articleId: string) {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('PDF ID 无效');
  return join(thumbnailDirectory(), `${safeId}.jpg`);
}

export async function savePdfThumbnail(articleId: string, data: Buffer) {
  await mkdir(thumbnailDirectory(), { recursive: true });
  await writeFile(thumbnailFilePath(articleId), data);
}

// 展示侧读图：命中返回 data URI，未生成则返回空串（由调用方决定懒生成或兜底）。
export async function readPdfThumbnailDataUrl(articleId: string): Promise<string> {
  try {
    const data = await readFile(thumbnailFilePath(articleId));
    return `data:image/jpeg;base64,${data.toString('base64')}`;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return '';
    throw error;
  }
}

export async function deletePdfThumbnail(articleId: string) {
  await rm(thumbnailFilePath(articleId), { force: true });
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
