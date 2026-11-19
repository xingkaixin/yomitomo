import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { PdfEngine, PdfiumNative, type ImageDataConverter } from '@embedpdf/engines/pdfium';
import { NoopLogger, type PdfDocumentObject } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';
import type { ArticleRecord } from '@yomitomo/shared';
import { MAX_PDF_IMPORT_BYTES } from '../../ipc-contract';
import { SourceImportError, type SourceImportErrorCode } from '../../ipc/article-import-boundary';
import { readPdfiumWasmBinary } from './pdfium-resource';

// 封面缩略图：约 300px 宽的 JPEG，导入期一次性渲染并本地持久化。
export const PDF_THUMBNAIL_TARGET_WIDTH = 300;
export const PDF_THUMBNAIL_MAX_HEIGHT = 600;
export const PDF_THUMBNAIL_QUALITY = 0.72;

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type PdfThumbnailBitmap = {
  bitmap: ArrayBuffer;
  width: number;
  height: number;
};

export type PdfEngineImportResult = {
  article: ArticleRecord;
  thumbnailBitmap: PdfThumbnailBitmap | null;
};

export type PdfWorkerInitData = {
  wasmPath?: string;
};

export type PdfWorkerRequest =
  | { id: number; kind: 'import'; input: PdfImportFileInput }
  | { id: number; kind: 'thumbnail'; data: ArrayBuffer };

export type PdfWorkerResponse =
  | {
      id: number;
      ok: true;
      kind: 'import';
      article: ArticleRecord;
      thumbnailBitmap: PdfThumbnailBitmap | null;
    }
  | {
      id: number;
      ok: true;
      kind: 'thumbnail';
      thumbnailBitmap: PdfThumbnailBitmap | null;
    }
  | {
      id: number;
      ok: false;
      errorCode?: SourceImportErrorCode;
      message: string;
    };

export function validatePdfImportInput(input: PdfImportFileInput) {
  const fileName = input.fileName.trim() || 'Untitled.pdf';
  const fileSize = input.data.byteLength;
  if (!isPdfFile(fileName, input.mimeType)) {
    throw new SourceImportError('PDF_IMPORT_INVALID_FILE');
  }
  if (fileSize > MAX_PDF_IMPORT_BYTES) {
    throw new SourceImportError('PDF_IMPORT_FILE_TOO_LARGE');
  }
  return { fileName, fileSize };
}

export function pdfContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function pdfArticleId(contentHash: string) {
  return `pdf_${contentHash.slice(0, 24)}`;
}

export function createPdfImportRuntime(options: { wasmPath?: string } = {}) {
  let pdfEnginePromise: Promise<PdfEngine<PdfThumbnailBitmap>> | undefined;
  let nextDocumentHandleId = 0;

  function nextDocumentOpenId(prefix: string) {
    nextDocumentHandleId += 1;
    return `${prefix}_${nextDocumentHandleId}`;
  }

  async function pdfImportEngine() {
    if (!pdfEnginePromise) {
      const pending = createPdfImportEngine(options.wasmPath).catch((error: unknown) => {
        if (pdfEnginePromise === pending) pdfEnginePromise = undefined;
        throw error;
      });
      pdfEnginePromise = pending;
    }
    return pdfEnginePromise;
  }

  async function extractArticle(input: PdfImportFileInput): Promise<PdfEngineImportResult> {
    const { fileName, fileSize } = validatePdfImportInput(input);
    const contentHash = pdfContentHash(new Uint8Array(input.data));
    const id = pdfArticleId(contentHash);
    const engine = await pdfImportEngine();
    const document = await engine
      .openDocumentBuffer({ id: nextDocumentOpenId(id), content: input.data })
      .toPromise();
    try {
      const info = await engine.getMetadata(document).toPromise();
      const title = cleanPdfText(info.title) || fileTitle(fileName);
      const author = cleanPdfText(info.author);
      const subject = cleanPdfText(info.subject);
      const now = new Date().toISOString();
      // 复用同一已打开的文档顺手渲染首页缩略图，不重开文档。
      const thumbnailBitmap = await renderFirstPageThumbnailBitmap(engine, document);

      return {
        thumbnailBitmap,
        article: {
          id,
          url: `pdf:${id}`,
          canonicalUrl: `pdf:${contentHash}`,
          sourceType: 'pdf',
          title,
          byline: author,
          excerpt: subject,
          siteName: 'PDF',
          contentHash,
          pdf: {
            metadata: {
              format: 'pdf',
              fileName,
              fileSize,
              pageCount: document.pageCount,
              title,
              author,
              subject,
              keywords: cleanPdfText(info.keywords),
              creator: cleanPdfText(info.creator),
              producer: cleanPdfText(info.producer),
              creationDate: cleanPdfDate(info.creationDate),
              modificationDate: cleanPdfDate(info.modificationDate),
            },
          },
          readingProgress: {
            kind: 'page',
            pageIndex: 0,
            pageCount: document.pageCount,
            updatedAt: now,
          },
          annotations: [],
          createdAt: now,
          updatedAt: now,
        },
      };
    } finally {
      await engine.closeDocument(document).toPromise();
    }
  }

  async function renderThumbnailBitmap(data: ArrayBuffer): Promise<PdfThumbnailBitmap | null> {
    const engine = await pdfImportEngine();
    const document = await engine
      .openDocumentBuffer({ id: nextDocumentOpenId('pdf_thumb'), content: data })
      .toPromise();
    try {
      return await renderFirstPageThumbnailBitmap(engine, document);
    } finally {
      await engine.closeDocument(document).toPromise();
    }
  }

  return {
    extractArticle,
    renderThumbnailBitmap,
  };
}

async function renderFirstPageThumbnailBitmap(
  engine: PdfEngine<PdfThumbnailBitmap>,
  document: PdfDocumentObject,
): Promise<PdfThumbnailBitmap | null> {
  const page = document.pages[0];
  if (!page) return null;
  const { width, height } = page.size;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const scaleFactor = Math.min(
    PDF_THUMBNAIL_TARGET_WIDTH / width,
    PDF_THUMBNAIL_MAX_HEIGHT / height,
    2,
  );
  // The rendering engine clamps scales to 0.01, so smaller requested scales would not be honored.
  if (scaleFactor < 0.01) return null;
  try {
    return await engine
      .renderPage(document, page, {
        scaleFactor,
        imageType: 'image/jpeg',
        imageQuality: PDF_THUMBNAIL_QUALITY,
      })
      .toPromise();
  } catch {
    return null;
  }
}

async function createPdfImportEngine(wasmPath?: string) {
  const logger = new NoopLogger();
  const pdfiumModule = await init({ wasmBinary: await readPdfiumWasmBinary(wasmPath) });
  const native = new PdfiumNative(pdfiumModule, { logger });
  return new PdfEngine<PdfThumbnailBitmap>(native, {
    imageConverter: pdfImportBitmapConverter,
    logger,
  });
}

// Worker threads cannot import Electron nativeImage; return BGRA pixels for main to JPEG-encode.
const pdfImportBitmapConverter: ImageDataConverter<PdfThumbnailBitmap> = async (getImageData) => {
  const image = getImageData();
  return {
    bitmap: rgbaToBgraBuffer(image.data),
    width: image.width,
    height: image.height,
  };
};

// nativeImage.createFromBitmap expects native BGRA byte order while PDFium outputs RGBA.
export function rgbaToBgraBuffer(data: Uint8ClampedArray): ArrayBuffer {
  const bgra = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index += 4) {
    bgra[index] = data[index + 2];
    bgra[index + 1] = data[index + 1];
    bgra[index + 2] = data[index];
    bgra[index + 3] = data[index + 3];
  }
  return bgra.buffer;
}

function isPdfFile(fileName: string, mimeType: string | undefined) {
  const normalizedMime = mimeType?.toLowerCase();
  return (
    fileName.toLowerCase().endsWith('.pdf') ||
    normalizedMime === 'application/pdf' ||
    normalizedMime === 'application/x-pdf'
  );
}

function fileTitle(fileName: string) {
  return (
    basename(fileName)
      .replace(/\.pdf$/i, '')
      .trim() || 'Untitled PDF'
  );
}

function cleanPdfText(value: string | null | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}

function cleanPdfDate(value: Date | null | undefined) {
  return value?.toISOString();
}
