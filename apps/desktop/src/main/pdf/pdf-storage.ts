import { Buffer } from 'node:buffer';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';

function pdfDirectory() {
  return join(app.getPath('userData'), 'pdf');
}

function pdfFilePath(articleId: string) {
  const safeId = articleId.replace(/[^a-z0-9_-]/gi, '');
  if (!safeId) throw new Error('PDF_SOURCE_INVALID_ID');
  return join(pdfDirectory(), `${safeId}.pdf`);
}

export async function savePdfSourceFile(articleId: string, data: ArrayBuffer) {
  await mkdir(pdfDirectory(), { recursive: true });
  await writeFile(pdfFilePath(articleId), Buffer.from(data));
}

export async function readPdfSourceFile(articleId: string) {
  try {
    return await readFile(pdfFilePath(articleId));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      throw new Error('PDF_SOURCE_FILE_MISSING', { cause: error });
    }
    throw error;
  }
}

export async function deletePdfSourceFile(articleId: string) {
  await rm(pdfFilePath(articleId), { force: true });
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}
