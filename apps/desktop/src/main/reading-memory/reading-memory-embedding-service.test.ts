import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReadingMemoryEmbeddingService,
  type ReadingMemoryEmbeddingProcess,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import type { ReadingMemoryEmbeddingWorkerRequest } from './reading-memory-embedding-worker-protocol';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';

const manifest = parseReadingMemoryModelManifest(
  JSON.parse(
    readFileSync(
      new URL('../../../model-releases/reading-memory-embedding-v1/manifest.json', import.meta.url),
      'utf8',
    ),
  ),
);
const installation: ReadingMemoryModelInstallation = {
  status: 'available',
  internalId: manifest.internalId,
  downloadSizeBytes: manifest.distributionDownloadSizeBytes,
  directory: '/tmp/yomitomo-embedding-service-test/model',
  manifest,
};
const dimension = manifest.vector.dimension;
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

describe('reading memory embedding service', () => {
  it('prioritizes queued query requests ahead of queued document batches on a single worker', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });
    cleanups.push(() => service.dispose());

    const doc1 = service.embed({ purpose: 'document', texts: ['doc-1'] });
    const doc2 = service.embed({ purpose: 'document', texts: ['doc-2'] });
    const query1 = service.embed({ purpose: 'query', texts: ['query-1'] });
    const doc3 = service.embed({ purpose: 'document', texts: ['doc-3'] });
    const query2 = service.embed({ purpose: 'query', texts: ['query-2'] });

    expect(workers).toHaveLength(1);
    const worker = workers[0];
    const order: string[] = [];

    for (let step = 0; step < 5; step += 1) {
      await vi.waitFor(() => {
        expect(worker.pendingEmbed).not.toBeNull();
      });
      const current = worker.pendingEmbed;
      if (!current) throw new Error('Expected an active embed request');
      order.push(current.texts[0]);
      worker.resolvePending();
    }

    const results = await Promise.all([doc1, doc2, query1, doc3, query2]);
    expect(order).toEqual(['doc-1', 'query-1', 'query-2', 'doc-2', 'doc-3']);
    expect(workers).toHaveLength(1);
    expect(results.every((result) => result.dimension === dimension)).toBe(true);
  });

  it('cancels a queued query without disturbing active or queued document batches', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });
    cleanups.push(() => service.dispose());

    const doc1 = service.embed({ purpose: 'document', texts: ['doc-1'] });
    const doc2 = service.embed({ purpose: 'document', texts: ['doc-2'] });
    const queryController = new AbortController();
    const query1 = service.embed(
      { purpose: 'query', texts: ['query-1'] },
      { signal: queryController.signal },
    );

    queryController.abort();
    await expect(query1).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_CANCELED' });

    const worker = workers[0];
    expect(worker.kills).toBe(0);
    worker.resolvePending();
    await expect(doc1).resolves.toMatchObject({ dimension });

    await vi.waitFor(() => {
      expect(worker.pendingEmbed?.texts).toEqual(['doc-2']);
    });
    worker.resolvePending();
    await expect(doc2).resolves.toMatchObject({ dimension });

    expect(workers).toHaveLength(1);
    expect(worker.embedTexts).toEqual(['doc-1', 'doc-2']);
  });

  it('cancels an in-flight query without restarting the worker and runs queued document work next', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });
    cleanups.push(() => service.dispose());

    const queryController = new AbortController();
    const query1 = service.embed(
      { purpose: 'query', texts: ['query-1'] },
      { signal: queryController.signal },
    );
    const doc1 = service.embed({ purpose: 'document', texts: ['doc-1'] });

    const worker = workers[0];
    await vi.waitFor(() => {
      expect(worker.pendingEmbed?.texts).toEqual(['query-1']);
    });

    queryController.abort();
    await expect(query1).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_CANCELED' });
    expect(worker.kills).toBe(0);

    // Worker finishes the canceled query normally and remains warm for the queued document batch.
    worker.resolvePending();

    await vi.waitFor(() => {
      expect(worker.pendingEmbed?.texts).toEqual(['doc-1']);
    });
    worker.resolvePending();
    await expect(doc1).resolves.toMatchObject({ dimension });
    expect(workers).toHaveLength(1);
  });

  it('restarts the worker after timeout and completes queued work on a fresh worker', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      timeoutMs: 40,
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });
    cleanups.push(() => service.dispose());

    const stalled = service.embed({ purpose: 'document', texts: ['stalled'] });
    const queuedQuery = service.embed({ purpose: 'query', texts: ['recovery-query'] });

    await expect(stalled).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_TIMEOUT' });
    expect(workers[0].kills).toBe(1);

    await vi.waitFor(() => {
      expect(workers).toHaveLength(2);
      expect(workers[1].pendingEmbed?.texts).toEqual(['recovery-query']);
    });
    workers[1].resolvePending();
    await expect(queuedQuery).resolves.toMatchObject({ dimension });
  });

  it('restarts a hung worker after an in-flight cancel times out so queued work recovers', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      timeoutMs: 40,
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });
    cleanups.push(() => service.dispose());

    const controller = new AbortController();
    const canceled = service.embed(
      { purpose: 'query', texts: ['hung-query'] },
      { signal: controller.signal },
    );
    const queuedDoc = service.embed({ purpose: 'document', texts: ['queued-doc'] });

    controller.abort();
    await expect(canceled).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_CANCELED' });
    expect(workers[0].kills).toBe(0);

    await vi.waitFor(() => {
      expect(workers[0].kills).toBe(1);
      expect(workers).toHaveLength(2);
      expect(workers[1].pendingEmbed?.texts).toEqual(['queued-doc']);
    });
    workers[1].resolvePending();
    await expect(queuedDoc).resolves.toMatchObject({ dimension });
  });

  it('fails queued and active requests on disposal and terminates the worker', async () => {
    const workers: FakeWorker[] = [];
    const service = createReadingMemoryEmbeddingService(installation, {
      createProcess: () => {
        const worker = new FakeWorker(workers.length + 1);
        workers.push(worker);
        return worker;
      },
    });

    const active = service.embed({ purpose: 'document', texts: ['doc-1'] });
    const queuedQuery = service.embed({ purpose: 'query', texts: ['query-1'] });
    const queuedDoc = service.embed({ purpose: 'document', texts: ['doc-2'] });

    await service.dispose();

    await expect(active).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_DISPOSED' });
    await expect(queuedQuery).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_DISPOSED' });
    await expect(queuedDoc).rejects.toMatchObject({ code: 'READING_MEMORY_EMBEDDING_DISPOSED' });
    expect(workers[0].kills).toBe(1);
  });
});

type EmbedRequest = Extract<ReadingMemoryEmbeddingWorkerRequest, { type: 'embed' }>;

class FakeWorker extends EventEmitter implements ReadingMemoryEmbeddingProcess {
  readonly pid: number;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  pendingEmbed: EmbedRequest | null = null;
  embedTexts: string[] = [];
  kills = 0;

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  send(message: ReadingMemoryEmbeddingWorkerRequest, callback: (error: Error | null) => void) {
    callback(null);
    if (message.type === 'embed') {
      this.pendingEmbed = message;
      this.embedTexts.push(...message.texts);
    } else if (message.type === 'dispose') {
      queueMicrotask(() => this.emit('message', { type: 'disposed' }));
    }
    return true;
  }

  resolvePending() {
    const request = this.pendingEmbed;
    if (!request) throw new Error('No pending embed request');
    this.pendingEmbed = null;
    const vectors = new Float32Array(request.texts.length * dimension);
    for (let row = 0; row < request.texts.length; row += 1) vectors[row * dimension] = 1;
    this.emit('message', {
      type: 'result',
      requestId: request.requestId,
      count: request.texts.length,
      dimension,
      buffer: vectors.buffer,
    });
  }

  kill(signal: 'SIGKILL') {
    this.kills += 1;
    this.signalCode = signal;
    queueMicrotask(() => this.emit('exit', null, signal));
    return true;
  }
}
