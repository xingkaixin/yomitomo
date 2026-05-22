import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { ArticleRecord } from '@yomitomo/shared';

export const MAX_PDF_BYTES = 120 * 1024 * 1024;

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

type PdfInfo = {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
  Creator?: string;
  Producer?: string;
  CreationDate?: string;
  ModDate?: string;
};

export async function articleRecordFromPdfFile(input: PdfImportFileInput): Promise<ArticleRecord> {
  const fileName = input.fileName.trim() || 'Untitled.pdf';
  const fileSize = input.data.byteLength;
  if (!isPdfFile(fileName, input.mimeType)) throw new Error('请选择 PDF 文件');
  if (fileSize > MAX_PDF_BYTES) throw new Error('PDF 文件不能超过 120MB');

  const bytes = new Uint8Array(input.data);
  const contentHash = pdfContentHash(bytes);
  const loadingTask = getDocument({ data: bytes.slice() });
  const document = await loadingTask.promise;
  try {
    const metadata = await document.getMetadata().catch(() => null);
    const info = metadata?.info as PdfInfo | undefined;
    const id = pdfArticleId(contentHash);
    const title = cleanPdfText(info?.Title) || fileTitle(fileName);
    const author = cleanPdfText(info?.Author);
    const now = new Date().toISOString();

    return {
      id,
      url: `pdf:${id}`,
      canonicalUrl: `pdf:${contentHash}`,
      sourceType: 'pdf',
      title,
      byline: author,
      excerpt: cleanPdfText(info?.Subject),
      siteName: 'PDF',
      contentHash,
      pdf: {
        metadata: {
          format: 'pdf',
          fileName,
          fileSize,
          pageCount: document.numPages,
          title,
          author,
          subject: cleanPdfText(info?.Subject),
          keywords: cleanPdfText(info?.Keywords),
          creator: cleanPdfText(info?.Creator),
          producer: cleanPdfText(info?.Producer),
          creationDate: cleanPdfText(info?.CreationDate),
          modificationDate: cleanPdfText(info?.ModDate),
        },
      },
      readingProgress: {
        pageIndex: 0,
        pageCount: document.numPages,
        progress: 0,
        updatedAt: now,
      },
      annotations: [],
      createdAt: now,
      updatedAt: now,
    };
  } finally {
    await document.destroy();
  }
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

function cleanPdfText(value: string | undefined) {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || undefined;
}
