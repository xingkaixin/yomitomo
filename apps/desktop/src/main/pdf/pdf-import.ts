import { Buffer } from 'node:buffer';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, type WorkerOptions } from 'node:worker_threads';
import { nativeImage } from 'electron';
import type { ArticleRecord } from '@yomitomo/shared';
import { isSourceImportErrorCode, SourceImportError } from '../../ipc/article-import-boundary';
import {
  PDF_THUMBNAIL_QUALITY,
  pdfContentHash,
  validatePdfImportInput,
  type PdfImportFileInput,
  type PdfThumbnailBitmap,
  type PdfWorkerInitData,
  type PdfWorkerRequest,
  type PdfWorkerResponse,
} from './pdf-import-engine';
import { pdfiumWasmPath } from './pdfium-resource';

export type { PdfImportFileInput };

export type PdfImportResult = {
  article: ArticleRecord;
  thumbnail: Buffer | null;
};

const DEFAULT_PDF_WORKER_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_PDF_WORKER_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;

export type PdfWorkerLike = {
  on(event: 'message', listener: (message: PdfWorkerResponse) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(message: PdfWorkerRequest): void;
  terminate(): Promise<number>;
  removeAllListeners(): unknown;
  ref?: () => void;
  unref?: () => void;
};

export type PdfWorkerClientOptions = {
  createWorker?: (url: URL, options: WorkerOptions) => PdfWorkerLike;
  encodeThumbnail?: (bitmap: PdfThumbnailBitmap | null) => Buffer | null;
  idleTimeoutMs?: number;
  requestTimeoutMs?: number;
  resolveWasmPath?: () => string;
};

type PendingWorkerRequest = {
  resolve: (response: Extract<PdfWorkerResponse, { ok: true }>) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export function createPdfWorkerClient(options: PdfWorkerClientOptions = {}) {
  const createWorker =
    options.createWorker ??
    ((url: URL, workerOptions: WorkerOptions): PdfWorkerLike => new Worker(url, workerOptions));
  const encodeThumbnail = options.encodeThumbnail ?? encodeThumbnailBitmap;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_PDF_WORKER_IDLE_TIMEOUT_MS;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_PDF_WORKER_REQUEST_TIMEOUT_MS;
  const resolveWasmPath = options.resolveWasmPath ?? pdfiumWasmPath;

  let activeWorker: PdfWorkerLike | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let nextRequestId = 0;
  const pending = new Map<number, PendingWorkerRequest>();
  const inFlightThumbnails = new Map<string, Promise<Buffer | null>>();

  function clearIdleTimer() {
    if (!idleTimer) return;
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  function scheduleIdleTermination(worker: PdfWorkerLike) {
    clearIdleTimer();
    worker.unref?.();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      if (activeWorker !== worker || pending.size > 0) return;
      activeWorker = null;
      worker.removeAllListeners();
      void worker.terminate();
    }, idleTimeoutMs);
    idleTimer.unref?.();
  }

  function teardownWorker(worker: PdfWorkerLike, reason?: Error) {
    clearIdleTimer();
    if (activeWorker === worker) activeWorker = null;
    worker.removeAllListeners();
    void worker.terminate();

    if (reason && pending.size > 0) {
      const inflight = [...pending.values()];
      pending.clear();
      for (const entry of inflight) {
        clearTimeout(entry.timeout);
        entry.reject(reason);
      }
    }
  }

  function ensureWorker(): PdfWorkerLike {
    clearIdleTimer();
    if (activeWorker) {
      activeWorker.ref?.();
      return activeWorker;
    }

    const initData: PdfWorkerInitData = { wasmPath: resolveWasmPath() };
    const worker = createWorker(pdfImportWorkerUrl(), { workerData: initData });
    activeWorker = worker;

    worker.on('message', (message: PdfWorkerResponse) => {
      if (activeWorker !== worker) return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timeout);

      if (message.ok) {
        entry.resolve(message);
      } else if (message.errorCode && isSourceImportErrorCode(message.errorCode)) {
        entry.reject(new SourceImportError(message.errorCode));
      } else {
        entry.reject(new Error(message.message || 'PDF_WORKER_FAILED'));
      }

      if (pending.size === 0 && activeWorker === worker) {
        scheduleIdleTermination(worker);
      }
    });

    worker.on('error', (error: Error) => {
      if (activeWorker !== worker) return;
      teardownWorker(worker, error);
    });

    worker.on('exit', (code: number) => {
      if (activeWorker !== worker) return;
      teardownWorker(worker, new Error(`PDF_IMPORT_WORKER_EXITED (${code})`));
    });

    return worker;
  }

  function sendRequest(
    buildRequest: (id: number) => PdfWorkerRequest,
  ): Promise<Extract<PdfWorkerResponse, { ok: true }>> {
    return new Promise((resolve, reject) => {
      let worker: PdfWorkerLike;
      try {
        worker = ensureWorker();
      } catch (error: unknown) {
        reject(error instanceof Error ? error : new Error('PDF_WORKER_START_FAILED'));
        return;
      }

      nextRequestId += 1;
      const id = nextRequestId;
      const timeout = setTimeout(() => {
        if (!pending.has(id)) return;
        teardownWorker(worker, new Error('PDF_IMPORT_TIMEOUT'));
      }, requestTimeoutMs);
      timeout.unref?.();

      pending.set(id, { resolve, reject, timeout });
      try {
        // Keep the caller's ArrayBuffer attached: source-file staging persists input.data next.
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        worker.postMessage(buildRequest(id));
      } catch (error: unknown) {
        pending.delete(id);
        clearTimeout(timeout);
        const failure = error instanceof Error ? error : new Error('PDF_WORKER_POST_FAILED');
        teardownWorker(worker, failure);
        reject(failure);
      }
    });
  }

  async function importPdfFile(input: PdfImportFileInput): Promise<PdfImportResult> {
    validatePdfImportInput(input);
    const response = await sendRequest((id) => ({ id, kind: 'import', input }));
    if (response.kind !== 'import') {
      throw new Error('PDF_WORKER_PROTOCOL_MISMATCH');
    }
    return {
      article: response.article,
      thumbnail: encodeThumbnail(response.thumbnailBitmap),
    };
  }

  async function renderPdfThumbnail(data: ArrayBuffer): Promise<Buffer | null> {
    const contentHash = pdfContentHash(new Uint8Array(data));
    const existing = inFlightThumbnails.get(contentHash);
    if (existing) return existing;

    const promise = sendRequest((id) => ({ id, kind: 'thumbnail', data }))
      .then((response) => {
        if (response.kind !== 'thumbnail') {
          throw new Error('PDF_WORKER_PROTOCOL_MISMATCH');
        }
        return encodeThumbnail(response.thumbnailBitmap);
      })
      .finally(() => {
        if (inFlightThumbnails.get(contentHash) === promise) {
          inFlightThumbnails.delete(contentHash);
        }
      });

    inFlightThumbnails.set(contentHash, promise);
    return promise;
  }

  async function dispose() {
    clearIdleTimer();
    const worker = activeWorker;
    if (!worker) return;
    activeWorker = null;
    worker.removeAllListeners();
    if (pending.size > 0) {
      const inflight = [...pending.values()];
      pending.clear();
      const error = new Error('PDF_WORKER_DISPOSED');
      for (const entry of inflight) {
        clearTimeout(entry.timeout);
        entry.reject(error);
      }
    }
    await worker.terminate();
  }

  return {
    articleRecordFromPdfFile: importPdfFile,
    renderPdfThumbnailFromBuffer: renderPdfThumbnail,
    dispose,
  };
}

const defaultPdfWorkerClient = createPdfWorkerClient();

export function articleRecordFromPdfFile(input: PdfImportFileInput): Promise<PdfImportResult> {
  return defaultPdfWorkerClient.articleRecordFromPdfFile(input);
}

// 存量 PDF 首次可见时的懒生成：从已存源文件重开一次文档渲染缩略图（一次性、非热路径）。
export function renderPdfThumbnailFromBuffer(data: ArrayBuffer): Promise<Buffer | null> {
  return defaultPdfWorkerClient.renderPdfThumbnailFromBuffer(data);
}

export function disposePdfWorker() {
  return defaultPdfWorkerClient.dispose();
}

export function encodeThumbnailBitmap(raw: PdfThumbnailBitmap | null): Buffer | null {
  if (!raw || raw.width <= 0 || raw.height <= 0 || raw.bitmap.byteLength === 0) return null;
  try {
    const native = nativeImage.createFromBitmap(Buffer.from(raw.bitmap), {
      width: raw.width,
      height: raw.height,
    });
    return native.toJPEG(Math.round(PDF_THUMBNAIL_QUALITY * 100));
  } catch {
    return null;
  }
}

function pdfImportWorkerUrl() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return new URL(
    basename(currentDir) === 'chunks' ? '../pdf-import-worker.js' : './pdf-import-worker.js',
    import.meta.url,
  );
}
