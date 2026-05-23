import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { PdfEngine, PdfiumNative, type ImageDataConverter } from '@embedpdf/engines/pdfium';
import { NoopLogger } from '@embedpdf/models';
import { init } from '@embedpdf/pdfium';
import type { ArticleRecord } from '@yomitomo/shared';

export const MAX_PDF_BYTES = 120 * 1024 * 1024;

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

let pdfEnginePromise: Promise<PdfEngine<Buffer>> | undefined;

export async function articleRecordFromPdfFile(input: PdfImportFileInput): Promise<ArticleRecord> {
  const fileName = input.fileName.trim() || 'Untitled.pdf';
  const fileSize = input.data.byteLength;
  if (!isPdfFile(fileName, input.mimeType)) throw new Error('请选择 PDF 文件');
  if (fileSize > MAX_PDF_BYTES) throw new Error('PDF 文件不能超过 120MB');

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

    return {
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
    };
  } finally {
    await engine.closeDocument(document).toPromise();
  }
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

const pdfImportImageConverter: ImageDataConverter<Buffer> = async () => {
  throw new Error('PDF 导入不渲染页面图像');
};

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
