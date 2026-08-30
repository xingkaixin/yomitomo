import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReadingMemoryEmbeddingService,
  type ReadingMemoryEmbeddingService,
  type ReadingMemoryEmbeddingServiceOptions,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import {
  type ReadingMemoryEmbeddingWorkerConfig,
  type ReadingMemoryEmbeddingWorkerRequest,
} from './reading-memory-embedding-worker-protocol';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';

const manifest = parseReadingMemoryModelManifest(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../download/model-releases/reading-memory-embedding-v1/manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ),
);
const installation: ReadingMemoryModelInstallation = {
  status: 'available',
  internalId: manifest.internalId,
  downloadSizeBytes: manifest.distributionDownloadSizeBytes,
  directory: resolvePath('/tmp/yomitomo-model-test/models/reading-memory-embedding-v1'),
  manifest,
};
const request = { purpose: 'query' as const, texts: ['跨语言证据检索'] };
const services: ReadingMemoryEmbeddingService[] = [];

class FakeWorker extends EventEmitter {
  readonly requests: ReadingMemoryEmbeddingWorkerRequest[] = [];
  terminateCalls = 0;
  autoAcknowledgeDispose = true;
  termination: Promise<number> = Promise.resolve(0);

  postMessage(message: ReadingMemoryEmbeddingWorkerRequest) {
    this.requests.push(message);
    if (message.type === 'dispose' && this.autoAcknowledgeDispose) {
      queueMicrotask(() => this.emit('message', { type: 'disposed' }));
    }
  }

  terminate() {
    this.terminateCalls += 1;
    return this.termination;
  }
}

describe('reading memory embedding service', () => {
  afterEach(async () => {
    vi.useRealTimers();
    await Promise.all(services.splice(0).map((service) => service.dispose()));
  });

  it('lazily starts and reuses one worker with the checked installation contract', async () => {
    const { service, workers, workerConfigs, workerUrls } = createService();
    expect(workers).toHaveLength(0);

    const first = service.embed(request);
    expect(workers).toHaveLength(1);
    expect(workerUrls[0].pathname).toMatch(/\/reading-memory-embedding-worker\.js$/);
    expect(workerConfigs[0]).toMatchObject({
      modelDirectory: installation.directory,
      modelVersion: manifest.internalId,
      runtimeVersion: manifest.runtime.version,
      maxTokens: 2048,
      dimension: 768,
      normalized: true,
      intraOpThreads: 4,
      interOpThreads: 1,
      queryPrefix: manifest.input.queryPrefix,
      documentPrefix: manifest.input.documentPrefix,
    });
    const firstVectors = respond(workers[0]);
    await expect(first).resolves.toEqual({
      modelVersion: manifest.internalId,
      dimension: 768,
      vectors: firstVectors,
    });

    const second = service.embed({ purpose: 'document', texts: ['one', 'two'] });
    const secondVectors = respond(workers[0]);
    await expect(second).resolves.toMatchObject({ vectors: secondVectors });
    expect(workers).toHaveLength(1);
    expect(workers[0].requests.filter((message) => message.type === 'embed')).toEqual([
      { type: 'embed', requestId: 1, ...request },
      { type: 'embed', requestId: 2, purpose: 'document', texts: ['one', 'two'] },
    ]);
  });

  it('rejects blank and oversized UTF-8 batches before starting a worker', async () => {
    const { service, workers } = createService();
    for (const texts of [[], [''], [' \n\t'], Array(17).fill('a'), ['中'.repeat(21_846)]]) {
      await expect(service.embed({ purpose: 'document', texts })).rejects.toMatchObject({
        code: 'READING_MEMORY_EMBEDDING_INVALID_INPUT',
      });
    }
    expect(workers).toHaveLength(0);

    const maximumBatch = service.embed({
      purpose: 'document',
      texts: Array(16).fill('a'.repeat(64 * 1024)),
    });
    respond(workers[0]);
    await expect(maximumBatch).resolves.toMatchObject({ dimension: 768 });
  });

  it('returns busy without queuing another batch', async () => {
    const { service, workers } = createService();
    const pending = service.embed(request);
    await expect(service.embed(request)).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_BUSY',
    });
    expect(workers[0].requests).toHaveLength(1);
    respond(workers[0]);
    await pending;
  });

  it('does not start a worker for an already canceled request', async () => {
    const { service, workers } = createService();
    const controller = new AbortController();
    controller.abort();
    await expect(service.embed(request, { signal: controller.signal })).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_CANCELED',
    });
    expect(workers).toHaveLength(0);
  });

  it('awaits cancellation cleanup and absorbs errors emitted during termination', async () => {
    const { service, workers } = createService();
    const controller = new AbortController();
    const pending = service.embed(request, { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_CANCELED',
    });
    const termination = deferred<number>();
    workers[0].termination = termination.promise;

    controller.abort();
    expect(workers[0].terminateCalls).toBe(1);
    expect(workers[0].listenerCount('message')).toBe(0);
    await expect(service.embed(request)).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_BUSY',
    });
    let lateError: unknown;
    try {
      workers[0].emit('error', new Error('late native shutdown error'));
    } catch (error) {
      lateError = error;
    }
    termination.resolve(0);
    await rejected;
    expect(lateError).toBeUndefined();

    const recovered = service.embed(request);
    expect(workers).toHaveLength(2);
    respond(workers[1]);
    await recovered;
  });

  it('keeps idle worker cleanup exclusive before recovering', async () => {
    const { service, workers } = createService();
    const first = service.embed(request);
    respond(workers[0]);
    await first;
    const termination = deferred<number>();
    workers[0].termination = termination.promise;
    workers[0].emit('error', new Error('idle worker failed'));

    const duringCleanup = service.embed(request).catch((error: unknown) => error);
    if (workers.length > 1) respond(workers[1]);
    const duringCleanupResult = await duringCleanup;
    termination.resolve(0);
    expect(duringCleanupResult).toMatchObject({ code: 'READING_MEMORY_EMBEDDING_BUSY' });
    await vi.waitFor(() => expect(workers[0].listenerCount('error')).toBe(0));

    const recovered = service.embed(request);
    expect(workers).toHaveLength(2);
    respond(workers[1]);
    await recovered;
  });

  it('terminates a timed-out worker and allows the next request to restart', async () => {
    vi.useFakeTimers();
    const { service, workers } = createService({ timeoutMs: 20 });
    const pending = service.embed(request);
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(20);
    await rejected;
    expect(workers[0].terminateCalls).toBe(1);

    const recovered = service.embed(request);
    respond(workers[1]);
    await recovered;
  });

  it.each(['error', 'messageerror', 'exit'] as const)(
    'cleans up a worker %s without replaying the failed batch',
    async (event) => {
      const { service, workers } = createService();
      const pending = service.embed(request);
      const rejected = expect(pending).rejects.toMatchObject({
        code: 'READING_MEMORY_EMBEDDING_WORKER_FAILED',
      });
      if (event === 'exit') workers[0].emit('exit', 1);
      else workers[0].emit(event, new Error('native inference failed'));
      await rejected;
      expect(workers[0].terminateCalls).toBe(1);
      expect(workers[0].requests).toHaveLength(1);
      expect(workers).toHaveLength(1);

      const recovered = service.embed(request);
      respond(workers[1]);
      await recovered;
    },
  );

  it.each(['dimension', 'non-finite', 'normalization'] as const)(
    'rejects invalid %s output and recycles the worker',
    async (kind) => {
      const { service, workers } = createService();
      const pending = service.embed(request);
      const rejected = expect(pending).rejects.toMatchObject({
        code: 'READING_MEMORY_EMBEDDING_WORKER_FAILED',
      });
      const vectors = unitVectors(1);
      if (kind === 'non-finite') vectors[0] = Number.NaN;
      if (kind === 'normalization') vectors[0] = 0.5;
      workers[0].emit('message', {
        type: 'result',
        requestId: 1,
        count: 1,
        dimension: kind === 'dimension' ? 384 : 768,
        buffer: vectors.buffer,
      });
      await rejected;
      expect(workers[0].terminateCalls).toBe(1);
    },
  );

  it('waits for graceful model disposal before terminating an idle worker', async () => {
    const { service, workers } = createService();
    const pending = service.embed(request);
    respond(workers[0]);
    await pending;
    workers[0].autoAcknowledgeDispose = false;

    const disposal = service.dispose();
    expect(service.dispose()).toBe(disposal);
    expect(workers[0].requests.at(-1)).toEqual({ type: 'dispose' });
    expect(workers[0].terminateCalls).toBe(0);
    workers[0].emit('message', { type: 'disposed' });
    await disposal;
    expect(workers[0].terminateCalls).toBe(1);
    await expect(service.embed(request)).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_DISPOSED',
    });
  });

  it('terminates an active worker when disposed and rejects the active batch', async () => {
    const { service, workers } = createService();
    const pending = service.embed(request);
    const rejected = expect(pending).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_DISPOSED',
    });
    const disposal = service.dispose();
    expect(service.dispose()).toBe(disposal);
    await disposal;
    await rejected;
    expect(workers[0].terminateCalls).toBe(1);
    expect(workers[0].requests).toHaveLength(1);
  });

  it('forces termination if graceful disposal never acknowledges', async () => {
    vi.useFakeTimers();
    const { service, workers } = createService();
    const pending = service.embed(request);
    respond(workers[0]);
    await pending;
    workers[0].autoAcknowledgeDispose = false;
    const disposal = service.dispose();
    await vi.advanceTimersByTimeAsync(5_000);
    await disposal;
    expect(workers[0].terminateCalls).toBe(1);
  });

  it('rejects a timeout outside the native timer range', () => {
    expect(() => createService({ timeoutMs: 2_147_483_648 })).toThrow(
      'Embedding timeout must be within the positive timer range',
    );
  });
});

function createService(options: ReadingMemoryEmbeddingServiceOptions = {}) {
  const workers: FakeWorker[] = [];
  const workerConfigs: ReadingMemoryEmbeddingWorkerConfig[] = [];
  const workerUrls: URL[] = [];
  const service = createReadingMemoryEmbeddingService(installation, {
    ...options,
    createWorker: (url, { workerData }) => {
      const worker = new FakeWorker();
      workers.push(worker);
      workerConfigs.push(workerData);
      workerUrls.push(url);
      return worker;
    },
  });
  services.push(service);
  return { service, workers, workerConfigs, workerUrls };
}

function respond(worker: FakeWorker) {
  const workerRequest = worker.requests.at(-1);
  if (workerRequest?.type !== 'embed') throw new Error('Expected an embedding request');
  const vectors = unitVectors(workerRequest.texts.length);
  worker.emit('message', {
    type: 'result',
    requestId: workerRequest.requestId,
    count: workerRequest.texts.length,
    dimension: 768,
    buffer: vectors.buffer,
  });
  return vectors;
}

function unitVectors(count: number) {
  const vectors = new Float32Array(count * 768);
  for (let index = 0; index < count; index += 1) vectors[index * 768 + index] = 1;
  return vectors;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
