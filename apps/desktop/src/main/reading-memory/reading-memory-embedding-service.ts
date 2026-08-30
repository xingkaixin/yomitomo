import { Worker } from 'node:worker_threads';
import { basename, dirname, isAbsolute, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReadingMemoryModelLifecycleState } from './reading-memory-model-lifecycle';
import {
  assertReadingMemoryEmbeddingVectors,
  parseReadingMemoryEmbeddingWorkerConfig,
  validateReadingMemoryEmbeddingRequest,
  type ReadingMemoryEmbeddingRequest,
  type ReadingMemoryEmbeddingWorkerConfig,
  type ReadingMemoryEmbeddingWorkerRequest,
} from './reading-memory-embedding-worker-protocol';

const defaultEmbeddingTimeoutMs = 2 * 60 * 1000;
const gracefulDisposeTimeoutMs = 5_000;
const embeddingErrorMessages = {
  READING_MEMORY_EMBEDDING_INVALID_INPUT: 'Embedding request is invalid',
  READING_MEMORY_EMBEDDING_BUSY: 'Embedding service is already processing or cleaning up a batch',
  READING_MEMORY_EMBEDDING_CANCELED: 'Embedding request was canceled',
  READING_MEMORY_EMBEDDING_TIMEOUT: 'Embedding request timed out',
  READING_MEMORY_EMBEDDING_WORKER_FAILED: 'Embedding worker failed',
  READING_MEMORY_EMBEDDING_DISPOSED: 'Embedding service has been disposed',
} as const;

export type ReadingMemoryEmbeddingErrorCode = keyof typeof embeddingErrorMessages;

export class ReadingMemoryEmbeddingError extends Error {
  readonly code: ReadingMemoryEmbeddingErrorCode;

  constructor(code: ReadingMemoryEmbeddingErrorCode, cause?: unknown) {
    super(embeddingErrorMessages[code], { cause });
    this.name = 'ReadingMemoryEmbeddingError';
    this.code = code;
  }
}

export type ReadingMemoryModelInstallation = Extract<
  ReadingMemoryModelLifecycleState,
  { status: 'available' }
>;

export type ReadingMemoryEmbeddingResult = {
  modelVersion: string;
  dimension: number;
  vectors: Float32Array;
};

export type ReadingMemoryEmbeddingCallOptions = { signal?: AbortSignal };

export type ReadingMemoryEmbeddingService = {
  embed(
    request: ReadingMemoryEmbeddingRequest,
    options?: ReadingMemoryEmbeddingCallOptions,
  ): Promise<ReadingMemoryEmbeddingResult>;
  dispose(): Promise<void>;
};

export type ReadingMemoryEmbeddingWorker = {
  on(event: 'message', listener: (message: unknown) => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'messageerror', listener: (error: Error) => void): unknown;
  on(event: 'exit', listener: (code: number) => void): unknown;
  off(event: 'message', listener: (message: unknown) => void): unknown;
  off(event: 'error', listener: (error: Error) => void): unknown;
  off(event: 'messageerror', listener: (error: Error) => void): unknown;
  off(event: 'exit', listener: (code: number) => void): unknown;
  postMessage(message: ReadingMemoryEmbeddingWorkerRequest): void;
  terminate(): Promise<number>;
};

export type ReadingMemoryEmbeddingServiceOptions = {
  timeoutMs?: number;
  createWorker?: (
    url: URL,
    options: { workerData: ReadingMemoryEmbeddingWorkerConfig },
  ) => ReadingMemoryEmbeddingWorker;
};

type WorkerSession = {
  worker: ReadingMemoryEmbeddingWorker;
  onMessage: (message: unknown) => void;
  onError: (error: Error) => void;
  onExit: (code: number) => void;
};

type ActiveBatch = {
  requestId: number;
  count: number;
  session: WorkerSession;
  clear: () => void;
  resolve: (result: ReadingMemoryEmbeddingResult) => void;
  reject: (error: ReadingMemoryEmbeddingError) => void;
};

export function createReadingMemoryEmbeddingService(
  installation: ReadingMemoryModelInstallation,
  options: ReadingMemoryEmbeddingServiceOptions = {},
): ReadingMemoryEmbeddingService {
  const config = embeddingWorkerConfig(installation);
  const timeoutMs = positiveTimeout(options.timeoutMs ?? defaultEmbeddingTimeoutMs);
  const createWorker =
    options.createWorker ??
    ((url: URL, workerOptions: { workerData: ReadingMemoryEmbeddingWorkerConfig }) =>
      new Worker(url, workerOptions));
  let session: WorkerSession | null = null;
  let activeBatch: ActiveBatch | null = null;
  let terminating: Promise<void> | null = null;
  let nextRequestId = 1;
  let disposePromise: Promise<void> | null = null;

  const terminateSession = (current: WorkerSession): Promise<void> => {
    if (session === current) session = null;
    detachSession(current);
    let tracked: Promise<void>;
    tracked = (async () => {
      try {
        await current.worker.terminate();
      } catch {
        return;
      } finally {
        current.worker.off('error', absorbWorkerError);
      }
    })().finally(() => {
      if (terminating === tracked) terminating = null;
    });
    terminating = tracked;
    return tracked;
  };

  const failBatch = (
    batch: ActiveBatch,
    code: ReadingMemoryEmbeddingErrorCode,
    cause?: unknown,
  ): Promise<void> => {
    if (activeBatch !== batch) return Promise.resolve();
    activeBatch = null;
    batch.clear();
    return terminateSession(batch.session).then(() => {
      batch.reject(new ReadingMemoryEmbeddingError(code, cause));
    });
  };

  const failSession = (current: WorkerSession, cause: unknown) => {
    if (session !== current) return;
    const batch = activeBatch;
    if (batch?.session === current) {
      void failBatch(batch, 'READING_MEMORY_EMBEDDING_WORKER_FAILED', cause);
      return;
    }
    void terminateSession(current);
  };

  const receiveMessage = (current: WorkerSession, value: unknown) => {
    if (session !== current) return;
    const batch = activeBatch;
    if (!batch || batch.session !== current) {
      failSession(current, new Error('Embedding worker sent an unsolicited response'));
      return;
    }

    try {
      const message = parseWorkerResponse(value);
      if (message.type === 'disposed' || message.requestId !== batch.requestId) {
        throw new Error('Embedding worker returned an unexpected response');
      }
      if (message.type === 'error') {
        void failBatch(batch, 'READING_MEMORY_EMBEDDING_WORKER_FAILED', new Error(message.message));
        return;
      }
      if (message.count !== batch.count || message.dimension !== config.dimension) {
        throw new Error('Embedding response shape metadata does not match the request');
      }
      const vectors = new Float32Array(message.buffer);
      assertReadingMemoryEmbeddingVectors(
        vectors,
        message.count,
        message.dimension,
        config.normalized,
      );
      batch.clear();
      activeBatch = null;
      batch.resolve({ modelVersion: config.modelVersion, dimension: config.dimension, vectors });
    } catch (error) {
      void failBatch(batch, 'READING_MEMORY_EMBEDDING_WORKER_FAILED', error);
    }
  };

  const spawnSession = () => {
    const worker: ReadingMemoryEmbeddingWorker = createWorker(readingMemoryEmbeddingWorkerUrl(), {
      workerData: config,
    });
    let current: WorkerSession;
    const onMessage = (message: unknown) => receiveMessage(current, message);
    const onError = (error: Error) => failSession(current, error);
    const onExit = (code: number) =>
      failSession(current, new Error(`Embedding worker exited unexpectedly with code ${code}`));
    current = { worker, onMessage, onError, onExit };
    worker.on('message', onMessage);
    worker.on('error', absorbWorkerError);
    worker.on('error', onError);
    worker.on('messageerror', onError);
    worker.on('exit', onExit);
    session = current;
    return current;
  };

  const embed = async (
    requestValue: ReadingMemoryEmbeddingRequest,
    { signal }: ReadingMemoryEmbeddingCallOptions = {},
  ) => {
    if (disposePromise) throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_DISPOSED');
    if (activeBatch || terminating) {
      throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_BUSY');
    }
    let request: ReadingMemoryEmbeddingRequest;
    try {
      request = validateReadingMemoryEmbeddingRequest(requestValue);
    } catch (error) {
      throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_INVALID_INPUT', error);
    }
    if (signal?.aborted) {
      throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_CANCELED');
    }
    let current: WorkerSession;
    try {
      current = session ?? spawnSession();
    } catch (error) {
      throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_WORKER_FAILED', error);
    }

    const requestId = nextRequestId;
    nextRequestId = requestId === Number.MAX_SAFE_INTEGER ? 1 : requestId + 1;
    return new Promise<ReadingMemoryEmbeddingResult>((resolve, reject) => {
      let batch: ActiveBatch;
      const abort = () => void failBatch(batch, 'READING_MEMORY_EMBEDDING_CANCELED');
      const timeout = setTimeout(() => {
        void failBatch(batch, 'READING_MEMORY_EMBEDDING_TIMEOUT');
      }, timeoutMs);
      const clear = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
      };
      batch = { requestId, count: request.texts.length, session: current, clear, resolve, reject };
      activeBatch = batch;
      signal?.addEventListener('abort', abort, { once: true });
      try {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin
        current.worker.postMessage({ type: 'embed', requestId, ...request });
      } catch (error) {
        void failBatch(batch, 'READING_MEMORY_EMBEDDING_WORKER_FAILED', error);
      }
    });
  };

  const dispose = () => {
    if (disposePromise) return disposePromise;
    disposePromise = (async () => {
      if (activeBatch) {
        await failBatch(activeBatch, 'READING_MEMORY_EMBEDDING_DISPOSED');
        return;
      }
      if (terminating) await terminating;
      const current = session;
      if (!current) return;
      session = null;
      detachSession(current);
      await requestWorkerDisposal(current.worker);
      await terminateSession(current);
    })();
    return disposePromise;
  };

  return { embed, dispose };
}

function requestWorkerDisposal(worker: ReadingMemoryEmbeddingWorker) {
  return new Promise<void>((resolve) => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (timeout) clearTimeout(timeout);
      worker.off('message', onMessage);
      worker.off('error', finish);
      worker.off('messageerror', finish);
      worker.off('exit', finish);
      resolve();
    };
    const onMessage = (message: unknown) => {
      if (isDisposedResponse(message)) finish();
    };
    worker.on('message', onMessage);
    worker.on('error', finish);
    worker.on('messageerror', finish);
    worker.on('exit', finish);
    timeout = setTimeout(finish, gracefulDisposeTimeoutMs);
    try {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage({ type: 'dispose' });
    } catch {
      finish();
    }
  });
}

function detachSession(session: WorkerSession) {
  session.worker.off('message', session.onMessage);
  session.worker.off('error', session.onError);
  session.worker.off('messageerror', session.onError);
  session.worker.off('exit', session.onExit);
}

function embeddingWorkerConfig(
  installation: ReadingMemoryModelInstallation,
): ReadingMemoryEmbeddingWorkerConfig {
  if (installation.status !== 'available') {
    throw new Error('Embedding service requires an available model installation');
  }
  if (!isAbsolute(installation.directory)) {
    throw new Error('Embedding model directory must be absolute');
  }
  const modelFile = installation.manifest.artifact.files.find(
    (file) => file.path === 'onnx/model_q4.onnx',
  );
  if (!modelFile) throw new Error('Embedding model artifact is missing');

  return parseReadingMemoryEmbeddingWorkerConfig({
    modelVersion: installation.manifest.internalId,
    runtimeVersion: installation.manifest.runtime.version,
    backendVersion: installation.manifest.runtime.backendVersion,
    modelDirectory: installation.directory,
    modelSubfolder: posix.dirname(modelFile.path),
    dtype: installation.manifest.runtime.dtype,
    device: installation.manifest.runtime.device,
    modelOutput: installation.manifest.runtime.modelOutput,
    maxTokens: installation.manifest.input.maxTokens,
    queryPrefix: installation.manifest.input.queryPrefix,
    documentPrefix: installation.manifest.input.documentPrefix,
    dimension: installation.manifest.vector.dimension,
    normalized: installation.manifest.vector.normalization === 'l2',
    intraOpThreads: installation.manifest.runtime.intraOpThreads,
    interOpThreads: installation.manifest.runtime.interOpThreads,
  });
}

function readingMemoryEmbeddingWorkerUrl() {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const relativeWorkerPath =
    basename(currentDirectory) === 'chunks'
      ? '../reading-memory-embedding-worker.js'
      : './reading-memory-embedding-worker.js';
  return new URL(relativeWorkerPath, import.meta.url);
}

function parseWorkerResponse(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Embedding worker response must be an object');
  }
  const response = value as Record<string, unknown>;
  if (response.type === 'disposed') return { type: 'disposed' } as const;
  if (!Number.isSafeInteger(response.requestId) || (response.requestId as number) <= 0) {
    throw new Error('Embedding worker response has an invalid request ID');
  }
  const requestId = response.requestId as number;
  if (response.type === 'error') {
    if (typeof response.message !== 'string') {
      throw new Error('Embedding worker error has no message');
    }
    return { type: 'error', requestId, message: response.message } as const;
  }
  if (response.type !== 'result') throw new Error('Embedding worker response type is invalid');
  if (!Number.isSafeInteger(response.count) || (response.count as number) <= 0) {
    throw new Error('Embedding worker response count is invalid');
  }
  if (!Number.isSafeInteger(response.dimension) || (response.dimension as number) <= 0) {
    throw new Error('Embedding worker response dimension is invalid');
  }
  if (!(response.buffer instanceof ArrayBuffer)) {
    throw new Error('Embedding worker response buffer is invalid');
  }
  return {
    type: 'result',
    requestId,
    count: response.count as number,
    dimension: response.dimension as number,
    buffer: response.buffer,
  } as const;
}

function isDisposedResponse(value: unknown) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).type === 'disposed'
  );
}

function positiveTimeout(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_147_483_647) {
    throw new Error('Embedding timeout must be within the positive timer range');
  }
  return value;
}

function absorbWorkerError() {}
