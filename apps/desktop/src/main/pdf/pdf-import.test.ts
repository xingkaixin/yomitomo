import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfWorkerRequest, PdfWorkerResponse } from './pdf-import-engine';
import type { PdfWorkerLike } from './pdf-import';

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
  pdfiumWasmPath: vi.fn(() => '/mock/pdfium.wasm'),
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
  pdfiumWasmPath: pdfMocks.pdfiumWasmPath,
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

class FakePdfWorker extends EventEmitter implements PdfWorkerLike {
  posted: PdfWorkerRequest[] = [];
  terminate = vi.fn(async () => 0);
  ref = vi.fn();
  unref = vi.fn();

  postMessage(message: PdfWorkerRequest) {
    this.posted.push(message);
  }

  respond(response: PdfWorkerResponse) {
    this.emit('message', response);
  }
}

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

afterEach(() => {
  vi.useRealTimers();
});

describe('createPdfImportRuntime', () => {
  it('extracts pdf metadata and thumbnail bitmap without copying the source buffer', async () => {
    const { createPdfImportRuntime } = await import('./pdf-import-engine');
    const runtime = createPdfImportRuntime({ wasmPath: '/mock/pdfium.wasm' });
    const data = arrayBufferFromBuffer(Buffer.from('%PDF fixture'));
    const expectedHash = createHash('sha256').update(new Uint8Array(data)).digest('hex');
    const expectedId = `pdf_${expectedHash.slice(0, 24)}`;
    const thumbnailBitmap = { bitmap: new Uint8Array([1, 2, 3, 4]).buffer, width: 1, height: 1 };
    const document = {
      id: `${expectedId}_1`,
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
    pdfMocks.engine.renderPage.mockReturnValue(asyncResult(thumbnailBitmap));

    const result = await runtime.extractArticle({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      data,
    });

    expect(result.thumbnailBitmap).toBe(thumbnailBitmap);
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
        kind: 'page',
        pageIndex: 0,
        pageCount: 7,
      },
      annotations: [],
    });
    const openCall = pdfMocks.engine.openDocumentBuffer.mock.calls[0]?.[0];
    expect(openCall.content).toBe(data);
    expect(openCall.id).toMatch(new RegExp(`^${expectedId}_\\d+$`));
    expect(pdfMocks.engine.renderPage).toHaveBeenCalledWith(document, document.pages[0], {
      scaleFactor: 0.5,
      imageType: 'image/jpeg',
      imageQuality: 0.72,
    });
    expect(pdfMocks.engine.closeDocument).toHaveBeenCalledWith(document);
  });

  it('recovers and retries pdf engine initialization after an initial failure', async () => {
    const { createPdfImportRuntime } = await import('./pdf-import-engine');
    const runtime = createPdfImportRuntime({ wasmPath: '/mock/pdfium.wasm' });
    const data = arrayBufferFromBuffer(Buffer.from('%PDF retry'));
    const thumbnailBitmap = { bitmap: new Uint8Array([9, 8, 7, 6]).buffer, width: 1, height: 1 };
    const document = {
      id: 'pdf_thumb_1',
      pageCount: 1,
      pages: [{ id: 'page-1', size: { width: 300, height: 400 } }],
    };

    pdfMocks.init.mockRejectedValueOnce(new Error('WASM init transient failure'));
    pdfMocks.init.mockResolvedValueOnce({});
    pdfMocks.engine.openDocumentBuffer.mockReturnValue(asyncResult(document));
    pdfMocks.engine.renderPage.mockReturnValue(asyncResult(thumbnailBitmap));

    await expect(runtime.renderThumbnailBitmap(data)).rejects.toThrow(
      'WASM init transient failure',
    );
    await expect(runtime.renderThumbnailBitmap(data)).resolves.toEqual(thumbnailBitmap);
    expect(pdfMocks.init).toHaveBeenCalledTimes(2);
  });

  it('isolates concurrent operations on the same pdf with unique document handles', async () => {
    const { createPdfImportRuntime } = await import('./pdf-import-engine');
    const runtime = createPdfImportRuntime({ wasmPath: '/mock/pdfium.wasm' });
    const data = arrayBufferFromBuffer(Buffer.from('%PDF concurrent same bytes'));
    const openDocs = new Map<string, { id: string; pageCount: number; pages: unknown[] }>();
    const importRender = deferred<{ bitmap: ArrayBuffer; width: number; height: number }>();
    const thumbRender = deferred<{ bitmap: ArrayBuffer; width: number; height: number }>();

    pdfMocks.engine.openDocumentBuffer.mockImplementation(({ id }: { id: string }) => {
      if (openDocs.has(id)) {
        return { toPromise: async () => Promise.reject(new Error(`Duplicate open id: ${id}`)) };
      }
      const doc = {
        id,
        pageCount: 2,
        pages: [{ id: `${id}-p0`, size: { width: 300, height: 400 } }],
      };
      openDocs.set(id, doc);
      return asyncResult(doc);
    });
    pdfMocks.engine.getMetadata.mockImplementation((doc: { id: string }) => ({
      toPromise: async () => {
        if (!openDocs.has(doc.id)) throw new Error(`Document closed early: ${doc.id}`);
        return { title: 'Shared PDF' };
      },
    }));
    pdfMocks.engine.renderPage.mockImplementation((doc: { id: string }) => {
      const gate = doc.id.startsWith('pdf_thumb_') ? thumbRender.promise : importRender.promise;
      return {
        toPromise: async () => {
          const bitmap = await gate;
          if (!openDocs.has(doc.id)) throw new Error(`Document closed during render: ${doc.id}`);
          return bitmap;
        },
      };
    });
    pdfMocks.engine.closeDocument.mockImplementation((doc: { id: string }) => {
      openDocs.delete(doc.id);
      return asyncResult(undefined);
    });

    const importPromise = runtime.extractArticle({
      fileName: 'shared.pdf',
      mimeType: 'application/pdf',
      data,
    });
    const thumbPromise = runtime.renderThumbnailBitmap(data);

    // Wait for both calls to open and reach renderPage before finishing the first call.
    await vi.waitFor(() => expect(pdfMocks.engine.renderPage).toHaveBeenCalledTimes(2));
    expect(openDocs.size).toBe(2);

    const thumbA = { bitmap: new Uint8Array([1, 2, 3, 4]).buffer, width: 1, height: 1 };
    const thumbB = { bitmap: new Uint8Array([5, 6, 7, 8]).buffer, width: 1, height: 1 };
    importRender.resolve(thumbA);
    const importResult = await importPromise;
    expect(importResult.thumbnailBitmap).toBe(thumbA);
    // First document closed, second must still be open until its render resolves.
    expect(openDocs.size).toBe(1);

    thumbRender.resolve(thumbB);
    await expect(thumbPromise).resolves.toBe(thumbB);
    expect(openDocs.size).toBe(0);
  });
});

describe('createPdfWorkerClient', () => {
  it('returns article metadata and encoded thumbnail, reuses warm worker, and reclaims on idle', async () => {
    vi.useFakeTimers();
    const workers: FakePdfWorker[] = [];
    const { createPdfWorkerClient } = await import('./pdf-import');
    const client = createPdfWorkerClient({
      idleTimeoutMs: 5_000,
      requestTimeoutMs: 10_000,
      createWorker: () => {
        const worker = new FakePdfWorker();
        workers.push(worker);
        return worker;
      },
    });

    const data = arrayBufferFromBuffer(Buffer.from('%PDF worker test'));
    const pendingImport = client.articleRecordFromPdfFile({
      fileName: 'guide.pdf',
      mimeType: 'application/pdf',
      data,
    });

    expect(workers).toHaveLength(1);
    const firstRequest = workers[0].posted[0];
    expect(firstRequest.kind).toBe('import');
    // Caller's buffer remains attached for subsequent source-file persistence.
    expect(data.byteLength).toBeGreaterThan(0);

    workers[0].respond({
      id: firstRequest.id,
      ok: true,
      kind: 'import',
      article: {
        id: 'pdf_123',
        url: 'pdf:pdf_123',
        canonicalUrl: 'pdf:hash',
        sourceType: 'pdf',
        title: 'Guide',
        siteName: 'PDF',
        contentHash: 'hash',
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'guide.pdf',
            fileSize: data.byteLength,
            pageCount: 1,
            title: 'Guide',
          },
        },
        annotations: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      thumbnailBitmap: { bitmap: new Uint8Array([10, 20, 30, 255]).buffer, width: 1, height: 1 },
    });

    const result = await pendingImport;
    expect(result.article.title).toBe('Guide');
    expect(result.thumbnail).toEqual(Buffer.from('native-jpeg'));
    expect(pdfMocks.createFromBitmap).toHaveBeenCalledWith(Buffer.from([10, 20, 30, 255]), {
      width: 1,
      height: 1,
    });

    // A second request before idle timeout reuses the same warm worker.
    await vi.advanceTimersByTimeAsync(2_000);
    const pendingThumb = client.renderPdfThumbnailFromBuffer(data);
    expect(workers).toHaveLength(1);
    const secondRequest = workers[0].posted[1];
    workers[0].respond({
      id: secondRequest.id,
      ok: true,
      kind: 'thumbnail',
      thumbnailBitmap: { bitmap: new Uint8Array([1, 2, 3, 255]).buffer, width: 1, height: 1 },
    });
    await expect(pendingThumb).resolves.toEqual(Buffer.from('native-jpeg'));

    // After idle timeout with no in-flight work, worker is terminated to release WASM memory.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    // Next request lazily spawns a fresh worker.
    const nextThumb = client.renderPdfThumbnailFromBuffer(data);
    expect(workers).toHaveLength(2);
    const thirdRequest = workers[1].posted[0];
    workers[1].respond({
      id: thirdRequest.id,
      ok: true,
      kind: 'thumbnail',
      thumbnailBitmap: null,
    });
    await expect(nextThumb).resolves.toBeNull();
    await client.dispose();
  });

  it('deduplicates concurrent lazy thumbnail renders for the same pdf', async () => {
    const workers: FakePdfWorker[] = [];
    const { createPdfWorkerClient } = await import('./pdf-import');
    const client = createPdfWorkerClient({
      idleTimeoutMs: 5_000,
      createWorker: () => {
        const worker = new FakePdfWorker();
        workers.push(worker);
        return worker;
      },
    });

    const dataA = arrayBufferFromBuffer(Buffer.from('%PDF same content'));
    const dataB = arrayBufferFromBuffer(Buffer.from('%PDF same content'));

    const p1 = client.renderPdfThumbnailFromBuffer(dataA);
    const p2 = client.renderPdfThumbnailFromBuffer(dataB);

    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(1);

    workers[0].respond({
      id: workers[0].posted[0].id,
      ok: true,
      kind: 'thumbnail',
      thumbnailBitmap: { bitmap: new Uint8Array([4, 5, 6, 255]).buffer, width: 1, height: 1 },
    });

    const [thumb1, thumb2] = await Promise.all([p1, p2]);
    expect(thumb1).toEqual(Buffer.from('native-jpeg'));
    expect(thumb2).toEqual(Buffer.from('native-jpeg'));
    await client.dispose();
  });

  it('terminates a stalled worker on timeout and recovers on the next request', async () => {
    vi.useFakeTimers();
    const workers: FakePdfWorker[] = [];
    const { createPdfWorkerClient } = await import('./pdf-import');
    const client = createPdfWorkerClient({
      idleTimeoutMs: 5_000,
      requestTimeoutMs: 1_000,
      createWorker: () => {
        const worker = new FakePdfWorker();
        workers.push(worker);
        return worker;
      },
    });

    const data = arrayBufferFromBuffer(Buffer.from('%PDF slow'));
    const stalled = client.renderPdfThumbnailFromBuffer(data);
    const assertion = expect(stalled).rejects.toThrow('PDF_IMPORT_TIMEOUT');
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
    expect(workers[0].terminate).toHaveBeenCalledOnce();

    // Subsequent call spawns a fresh worker and succeeds.
    const retried = client.renderPdfThumbnailFromBuffer(data);
    expect(workers).toHaveLength(2);
    workers[1].respond({
      id: workers[1].posted[0].id,
      ok: true,
      kind: 'thumbnail',
      thumbnailBitmap: { bitmap: new Uint8Array([7, 8, 9, 255]).buffer, width: 1, height: 1 },
    });
    await expect(retried).resolves.toEqual(Buffer.from('native-jpeg'));
    await client.dispose();
  });
});
