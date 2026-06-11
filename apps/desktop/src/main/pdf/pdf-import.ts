import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { PdfEngine, PdfiumNative, type ImageDataConverter } from '@embedpdf/engines/pdfium';
import { NoopLogger, type PdfDocumentObject } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';
import { nativeImage } from 'electron';
import type { ArticleRecord } from '@yomitomo/shared';
import { MAX_PDF_IMPORT_BYTES } from '../../ipc-contract';

export const MAX_PDF_BYTES = MAX_PDF_IMPORT_BYTES;

// 封面缩略图：约 300px 宽的 JPEG，导入期一次性渲染并本地持久化。
const PDF_THUMBNAIL_TARGET_WIDTH = 300;
const PDF_THUMBNAIL_QUALITY = 0.72;

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type PdfImportResult = {
  article: ArticleRecord;
  thumbnail: Buffer | null;
};

let pdfEnginePromise: Promise<PdfEngine<Buffer>> | undefined;

export async function articleRecordFromPdfFile(
  input: PdfImportFileInput,
): Promise<PdfImportResult> {
  const fileName = input.fileName.trim() || 'Untitled.pdf';
  const fileSize = input.data.byteLength;
  if (!isPdfFile(fileName, input.mimeType)) throw new Error('PDF_IMPORT_INVALID_FILE');
  if (fileSize > MAX_PDF_IMPORT_BYTES) throw new Error('PDF_IMPORT_FILE_TOO_LARGE');

  const bytes = new Uint8Array(input.data);
  const contentHash = pdfContentHash(bytes);
  const engine = await pdfImportEngine();
  const document = await engine
    .openDocumentBuffer({ id: pdfArticleId(contentHash), content: input.data.slice(0) })
    .toPromise();
  try {
    const info = await engine.getMetadata(document).toPromise();
    const id = pdfArticleId(contentHash);
    const title = cleanPdfText(info.title) || fileTitle(fileName);
    const author = cleanPdfText(info.author);
    const subject = cleanPdfText(info.subject);
    const now = new Date().toISOString();
    // 复用同一已打开的文档顺手渲染首页缩略图，不重开文档。
    const thumbnail = await renderFirstPageThumbnail(engine, document);

    return {
      thumbnail,
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
          pageIndex: 0,
          pageCount: document.pageCount,
          progress: 0,
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

// 存量 PDF 首次可见时的懒生成：从已存源文件重开一次文档渲染缩略图（一次性、非热路径）。
export async function renderPdfThumbnailFromBuffer(data: ArrayBuffer): Promise<Buffer | null> {
  const contentHash = pdfContentHash(new Uint8Array(data));
  const engine = await pdfImportEngine();
  const document = await engine
    .openDocumentBuffer({ id: pdfArticleId(contentHash), content: data.slice(0) })
    .toPromise();
  try {
    return await renderFirstPageThumbnail(engine, document);
  } finally {
    await engine.closeDocument(document).toPromise();
  }
}

async function renderFirstPageThumbnail(
  engine: PdfEngine<Buffer>,
  document: PdfDocumentObject,
): Promise<Buffer | null> {
  const page = document.pages[0];
  if (!page || page.size.width <= 0) return null;
  const scaleFactor = clampScaleFactor(PDF_THUMBNAIL_TARGET_WIDTH / page.size.width);
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

function clampScaleFactor(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.max(value, 0.2), 2);
}

async function pdfImportEngine() {
  pdfEnginePromise ??= createPdfImportEngine();
  return pdfEnginePromise;
}

async function createPdfImportEngine() {
  const logger = new NoopLogger();
  const pdfiumModule = await init({});
  const native = new PdfiumNative(pdfiumModule, { logger });
  return new PdfEngine<Buffer>(native, { imageConverter: pdfImportImageConverter, logger });
}

// 主进程无图片编码库，借 Electron nativeImage 把 PDFium 的 RGBA 位图编码为 JPEG。
const pdfImportImageConverter: ImageDataConverter<Buffer> = async (
  getImageData,
  _imageType,
  imageQuality,
) => {
  const image = getImageData();
  const bitmap = rgbaToBgra(image.data);
  const native = nativeImage.createFromBitmap(bitmap, {
    width: image.width,
    height: image.height,
  });
  return native.toJPEG(Math.round((imageQuality ?? PDF_THUMBNAIL_QUALITY) * 100));
};

// nativeImage.createFromBitmap 需要平台原生的 BGRA 排布，PDFium 输出为 RGBA，交换 R/B 通道。
function rgbaToBgra(data: Uint8ClampedArray): Buffer {
  const bgra = Buffer.allocUnsafe(data.length);
  for (let index = 0; index < data.length; index += 4) {
    bgra[index] = data[index + 2];
    bgra[index + 1] = data[index + 1];
    bgra[index + 2] = data[index];
    bgra[index + 3] = data[index + 3];
  }
  return bgra;
}

function isPdfFile(fileName: string, mimeType: string | undefined) {
  const normalizedMime = mimeType?.toLowerCase();
  return (
    fileName.toLowerCase().endsWith('.pdf') ||
    normalizedMime === 'application/pdf' ||
    normalizedMime === 'application/x-pdf'
  );
}

function pdfContentHash(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pdfArticleId(contentHash: string) {
  return `pdf_${contentHash.slice(0, 24)}`;
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
