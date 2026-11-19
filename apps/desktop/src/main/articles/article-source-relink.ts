import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, extname } from 'node:path';
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron';
import type { ArticleRecord, ArticleUpsertPatch, EbookFormat } from '@yomitomo/shared';
import type { ArticleRelinkSourceResult } from '../../ipc-contract';
import {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  SourceImportError,
} from '../../ipc/article-import-boundary';
import { matchesLegacyEbook } from '../ebooks/ebook-source-identity';
import { stageEbookSourceFile } from '../ebooks/ebook-storage';
import { renderPdfThumbnailFromBuffer } from '../pdf/pdf-import';
import { stagePdfSourceAssets } from '../pdf/pdf-source-assets';

type UpdateEbookFormat = (
  articleId: string,
  format: EbookFormat,
) => Promise<ArticleUpsertPatch | null> | ArticleUpsertPatch | null;

type RelinkArticleSourceOptions = {
  article: Pick<ArticleRecord, 'id' | 'sourceType' | 'contentHash' | 'ebook'>;
  filePath: string;
  renderThumbnail?: (data: ArrayBuffer) => Promise<Buffer | null>;
  updateEbookFormat?: UpdateEbookFormat;
};

const EBOOK_EXTENSIONS = new Set<EbookFormat>(['epub', 'azw3', 'mobi']);

export async function relinkArticleSourceWithDialog({
  article,
  mainWindow,
  updateEbookFormat,
}: {
  article: Pick<ArticleRecord, 'id' | 'sourceType' | 'contentHash' | 'ebook'>;
  mainWindow: BrowserWindow | null;
  updateEbookFormat?: UpdateEbookFormat;
}): Promise<ArticleRelinkSourceResult> {
  if (article.sourceType !== 'pdf' && article.sourceType !== 'ebook') {
    throw new Error('ARTICLE_SOURCE_RELINK_UNSUPPORTED');
  }

  const options: OpenDialogOptions =
    article.sourceType === 'pdf'
      ? {
          properties: ['openFile'],
          filters: [{ name: 'PDF', extensions: ['pdf'] }],
        }
      : {
          properties: ['openFile'],
          filters: [{ name: 'Ebook', extensions: ['epub', 'azw3', 'mobi'] }],
        };

  const selection = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (selection.canceled || selection.filePaths.length === 0) {
    return { canceled: true };
  }

  const patch = await relinkArticleSourceFromPath({
    article,
    filePath: selection.filePaths[0],
    updateEbookFormat,
  });

  return patch ? { canceled: false, patch } : { canceled: false };
}

export async function relinkArticleSourceFromPath({
  article,
  filePath,
  renderThumbnail = renderPdfThumbnailFromBuffer,
  updateEbookFormat,
}: RelinkArticleSourceOptions): Promise<ArticleUpsertPatch | null> {
  if (article.sourceType !== 'pdf' && article.sourceType !== 'ebook') {
    throw new Error('ARTICLE_SOURCE_RELINK_UNSUPPORTED');
  }

  const extension = extname(filePath).slice(1).toLowerCase();
  const fileStats = await stat(filePath);

  if (article.sourceType === 'pdf') {
    if (extension !== 'pdf') throw new SourceImportError('PDF_IMPORT_INVALID_FILE');
    if (fileStats.size <= 0) throw new SourceImportError('PDF_IMPORT_INVALID_FILE');
    if (fileStats.size > MAX_PDF_IMPORT_BYTES) {
      throw new SourceImportError('PDF_IMPORT_FILE_TOO_LARGE');
    }

    const buffer = await readFile(filePath);
    if (
      !hasPdfSignature(buffer) ||
      createHash('sha256').update(buffer).digest('hex') !== article.contentHash
    )
      throw new SourceImportError('PDF_IMPORT_INVALID_FILE');

    const arrayBuffer = toArrayBuffer(buffer);
    const thumbnail = await renderThumbnail(arrayBuffer).catch((cause) => {
      throw new SourceImportError('PDF_IMPORT_INVALID_FILE', { cause });
    });
    const staged = await stagePdfSourceAssets(article.id, arrayBuffer, thumbnail);
    try {
      await staged.commit();
      await staged.finalize();
    } catch (error) {
      await staged.abort();
      throw error;
    }
    return null;
  }

  if (!EBOOK_EXTENSIONS.has(extension as EbookFormat)) {
    throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
  }
  if (fileStats.size <= 0) throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
  if (fileStats.size > MAX_EBOOK_IMPORT_BYTES) {
    throw new SourceImportError('EBOOK_IMPORT_FILE_TOO_LARGE');
  }

  const format = extension as EbookFormat;
  const buffer = await readFile(filePath);
  if (format === 'epub' && !hasZipSignature(buffer)) {
    throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
  }

  const arrayBuffer = toArrayBuffer(buffer);
  if (createHash('sha256').update(buffer).digest('hex') !== article.contentHash) {
    if (article.id.startsWith('ebook_')) throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
    const { importEbookInWorker } = await import('../ebooks/ebook-import-service');
    const imported = await importEbookInWorker({
      fileName: article.ebook?.metadata.fileName || basename(filePath),
      data: arrayBuffer,
    });
    if (!matchesLegacyEbook(article, imported))
      throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
  }
  if (article.ebook && article.ebook.metadata.format !== format)
    throw new SourceImportError('EBOOK_IMPORT_INVALID_FILE');
  const staged = await stageEbookSourceFile(article.id, arrayBuffer, format);
  try {
    await staged.commit();
    await staged.finalize();
  } catch (error) {
    await staged.abort();
    throw error;
  }

  return updateEbookFormat ? await updateEbookFormat(article.id, format) : null;
}

function hasPdfSignature(buffer: Buffer) {
  const header = buffer.subarray(0, Math.min(buffer.byteLength, 1024)).toString('latin1');
  return header.includes('%PDF-');
}

function hasZipSignature(buffer: Buffer) {
  return buffer.byteLength >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}
