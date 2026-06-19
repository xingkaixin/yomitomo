import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pdfMocks = vi.hoisted(() => ({
  engine: {
    openDocumentBuffer: vi.fn(),
    getMetadata: vi.fn(),
    renderPage: vi.fn(),
    closeDocument: vi.fn(),
  },
  PdfEngine: vi.fn(),
  PdfiumNative: vi.fn(),
  init: vi.fn(),
  createFromBitmap: vi.fn(),
  readPdfiumWasmBinary: vi.fn(),
  toJPEG: vi.fn(),
}));

vi.mock('@embedpdf/pdfium', () => ({
  init: pdfMocks.init,
}));

vi.mock('@embedpdf/engines/pdfium', () => ({
  PdfEngine: pdfMocks.PdfEngine,
  PdfiumNative: pdfMocks.PdfiumNative,
}));

vi.mock('./pdfium-resource', () => ({
  readPdfiumWasmBinary: pdfMocks.readPdfiumWasmBinary,
}));

vi.mock('electron', () => ({
  nativeImage: {
    createFromBitmap: pdfMocks.createFromBitmap,
  },
}));

function arrayBufferFromBuffer(buffer: Buffer) {
  const data = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(data).set(buffer);
  return data;
}

function asyncResult<T>(value: T) {
  return {
    toPromise: vi.fn(async () => value),
  };
}

function asyncFailure(error: Error) {
  return {
    toPromise: vi.fn(async () => {
      throw error;
    }),
  };
}

async function importPdfModule() {
  vi.resetModules();
  return import('./pdf-import');
}

describe('articleRecordFromPdfFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.readPdfiumWasmBinary.mockResolvedValue(new ArrayBuffer(8));
    pdfMocks.init.mockResolvedValue({});
    pdfMocks.PdfEngine.mockImplementation(function PdfEngineMock() {
      return pdfMocks.engine;
    });
    pdfMocks.PdfiumNative.mockImplementation(function PdfiumNativeMock() {
      return {};
    });
    pdfMocks.createFromBitmap.mockReturnValue({ toJPEG: pdfMocks.toJPEG });
    pdfMocks.toJPEG.mockReturnValue(Buffer.from('native-jpeg'));
    pdfMocks.engine.closeDocument.mockReturnValue(asyncResult(undefined));
  });

  it('extracts pdf metadata and renders a thumbnail into an article record', async () => {
    const data = arrayBufferFromBuffer(Buffer.from('%PDF fixture'));
    const expectedHash = createHash('sha256').update(new Uint8Array(data)).digest('hex');
    const expectedId = `pdf_${expectedHash.slice(0, 24)}`;
    const thumbnail = Buffer.from('thumbnail');
    const document = {
      pageCount: 7,
      pages: [{ id: 'page-1', size: { width: 600, height: 800 } }],
    };
    const creationDate = new Date('2025-01-02T03:04:05.000Z');
    const modificationDate = new Date('2025-02-03T04:05:06.000Z');
    pdfMocks.engine.openDocumentBuffer.mockReturnValue(asyncResult(document));
    pdfMocks.engine.getMetadata.mockReturnValue(
      asyncResult({
        title: '  Report   Title  ',
        author: '  Author   Name ',
        subject: '  Subject   line ',
        keywords: ' alpha, beta ',
        creator: ' Creator ',
        producer: ' Producer ',
        creationDate,
        modificationDate,
      }),
    );
    pdfMocks.engine.renderPage.mockReturnValue(asyncResult(thumbnail));
    const { articleRecordFromPdfFile } = await importPdfModule();

    const result = await articleRecordFromPdfFile({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      data,
    });

    expect(result.thumbnail).toBe(thumbnail);
    expect(result.article).toMatchObject({
      id: expectedId,
      url: `pdf:${expectedId}`,
      canonicalUrl: `pdf:${expectedHash}`,
      sourceType: 'pdf',
      title: 'Report Title',
      byline: 'Author Name',
      excerpt: 'Subject line',
      siteName: 'PDF',
      contentHash: expectedHash,
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'report.pdf',
          fileSize: data.byteLength,
          pageCount: 7,
          title: 'Report Title',
          author: 'Author Name',
          subject: 'Subject line',
          keywords: 'alpha, beta',
          creator: 'Creator',
          producer: 'Producer',
          creationDate: creationDate.toISOString(),
          modificationDate: modificationDate.toISOString(),
        },
      },
      readingProgress: {
        pageIndex: 0,
        pageCount: 7,
        progress: 0,
      },
      annotations: [],
    });
    expect(pdfMocks.engine.openDocumentBuffer).toHaveBeenCalledWith({
      id: expectedId,
      content: data.slice(0),
    });
    expect(pdfMocks.engine.renderPage).toHaveBeenCalledWith(document, document.pages[0], {
      scaleFactor: 0.5,
      imageType: 'image/jpeg',
      imageQuality: 0.72,
    });
    expect(pdfMocks.engine.closeDocument).toHaveBeenCalledWith(document);
  });

  it('falls back to the file name when pdf metadata has no title or author', async () => {
    const document = {
      pageCount: 1,
      pages: [{ id: 'page-1', size: { width: 0, height: 800 } }],
    };
    pdfMocks.engine.openDocumentBuffer.mockReturnValue(asyncResult(document));
    pdfMocks.engine.getMetadata.mockReturnValue(
      asyncResult({
        title: '   ',
        author: null,
        subject: undefined,
        keywords: undefined,
        creator: undefined,
        producer: undefined,
        creationDate: null,
        modificationDate: undefined,
      }),
    );
    const { articleRecordFromPdfFile } = await importPdfModule();

    const result = await articleRecordFromPdfFile({
      fileName: ' Missing Metadata.pdf ',
      data: arrayBufferFromBuffer(Buffer.from('%PDF missing metadata')),
    });

    expect(result.thumbnail).toBeNull();
    expect(result.article.title).toBe('Missing Metadata');
    expect(result.article.byline).toBeUndefined();
    expect(result.article.excerpt).toBeUndefined();
    expect(result.article.pdf?.metadata).toMatchObject({
      fileName: 'Missing Metadata.pdf',
      title: 'Missing Metadata',
      author: undefined,
      subject: undefined,
    });
    expect(pdfMocks.engine.renderPage).not.toHaveBeenCalled();
    expect(pdfMocks.engine.closeDocument).toHaveBeenCalledWith(document);
  });

  it('rejects invalid and oversized files before opening the pdf engine', async () => {
    const { articleRecordFromPdfFile, MAX_PDF_BYTES } = await importPdfModule();

    await expect(
      articleRecordFromPdfFile({
        fileName: 'notes.txt',
        mimeType: 'text/plain',
        data: arrayBufferFromBuffer(Buffer.from('not a pdf')),
      }),
    ).rejects.toThrow('PDF_IMPORT_INVALID_FILE');

    await expect(
      articleRecordFromPdfFile({
        fileName: 'huge.pdf',
        data: new ArrayBuffer(MAX_PDF_BYTES + 1),
      }),
    ).rejects.toThrow('PDF_IMPORT_FILE_TOO_LARGE');
    expect(pdfMocks.engine.openDocumentBuffer).not.toHaveBeenCalled();
  });

  it('propagates pdf engine failures without rendering or closing an unopened document', async () => {
    const error = new Error('corrupt pdf');
    pdfMocks.engine.openDocumentBuffer.mockReturnValue(asyncFailure(error));
    const { articleRecordFromPdfFile } = await importPdfModule();

    await expect(
      articleRecordFromPdfFile({
        fileName: 'broken.pdf',
        data: arrayBufferFromBuffer(Buffer.from('broken')),
      }),
    ).rejects.toThrow(error);

    expect(pdfMocks.engine.getMetadata).not.toHaveBeenCalled();
    expect(pdfMocks.engine.renderPage).not.toHaveBeenCalled();
    expect(pdfMocks.engine.closeDocument).not.toHaveBeenCalled();
  });
});

describe('renderPdfThumbnailFromBuffer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfMocks.readPdfiumWasmBinary.mockResolvedValue(new ArrayBuffer(8));
    pdfMocks.init.mockResolvedValue({});
    pdfMocks.PdfEngine.mockImplementation(function PdfEngineMock() {
      return pdfMocks.engine;
    });
    pdfMocks.PdfiumNative.mockImplementation(function PdfiumNativeMock() {
      return {};
    });
    pdfMocks.createFromBitmap.mockReturnValue({ toJPEG: pdfMocks.toJPEG });
    pdfMocks.toJPEG.mockReturnValue(Buffer.from('native-jpeg'));
    pdfMocks.engine.closeDocument.mockReturnValue(asyncResult(undefined));
  });

  it('returns null when first-page rendering fails', async () => {
    const document = {
      pageCount: 1,
      pages: [{ id: 'page-1', size: { width: 300, height: 400 } }],
    };
    pdfMocks.engine.openDocumentBuffer.mockReturnValue(asyncResult(document));
    pdfMocks.engine.renderPage.mockReturnValue(asyncFailure(new Error('render failed')));
    const { renderPdfThumbnailFromBuffer } = await importPdfModule();

    const thumbnail = await renderPdfThumbnailFromBuffer(
      arrayBufferFromBuffer(Buffer.from('%PDF render failure')),
    );

    expect(thumbnail).toBeNull();
    expect(pdfMocks.engine.closeDocument).toHaveBeenCalledWith(document);
  });
});
