import { readFileSync } from 'node:fs';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import type {
  ReadingMemoryEmbeddingResult,
  ReadingMemoryEmbeddingService,
  ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import type { ReadingMemoryEmbeddingRequest } from './reading-memory-embedding-worker-protocol';
import {
  readingMemoryEvidenceProjectorVersion,
  runReadingMemoryEvidenceProjectionBatch,
} from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import type {
  ReadingMemoryModelLifecycle,
  ReadingMemoryModelLifecycleState,
} from './reading-memory-model-lifecycle';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';
import {
  createReadingMemorySemanticIndex,
  type ReadingMemorySemanticIndex,
} from './reading-memory-semantic-index';
import type { ReadingMemoryDatabase } from './reading-memory-store-types';
import {
  activateReadingMemoryModelVersion,
  readActiveReadingMemoryModelVersion,
  readMissingReadingMemoryVectors,
  writeReadingMemoryVectors,
} from './reading-memory-vector-store';

const timestamp = '2026-08-30T00:00:00.000Z';
const library: ReadingEvidenceScope = { kind: 'library' };
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
  directory: '/tmp/yomitomo-semantic-index-test/model',
  manifest,
};
// This synthetic second version tests coordination, not compatibility of a future release.
const controlledInstallation = {
  ...installation,
  internalId: 'controlled-model-v2',
  directory: '/tmp/yomitomo-semantic-index-test/controlled-v2',
  manifest: { ...manifest, internalId: 'controlled-model-v2' },
} as unknown as ReadingMemoryModelInstallation;
const cleanups: (() => Promise<void>)[] = [];

beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('reading memory semantic index scheduling', () => {
  it('indexes four entries per batch and resumes only committed gaps after a pause', async () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) fixture.add(id);
    await fixture.index.reconcile();
    await tick();
    expect(fixture.inference.calls[0].request.texts).toEqual([
      'Evidence a',
      'Evidence b',
      'Evidence c',
      'Evidence d',
    ]);
    fixture.inference.calls[0].complete();
    await nextTurn();
    await fixture.index.pauseIndexing();
    expect(fixture.vectorCount()).toBe(4);
    expect((await fixture.index.getStatus()).semantic).toMatchObject({
      state: 'building',
      indexingPaused: true,
      coverage: { indexedEntryCount: 4, eligibleEntryCount: 6 },
    });
    await tick(60_000);
    expect(fixture.inference.calls).toHaveLength(1);

    fixture.index.resumeIndexing();
    await tick();
    expect(fixture.inference.calls[1].request.texts).toEqual(['Evidence e', 'Evidence f']);
    fixture.inference.calls[1].complete();
    await nextTurn();
    await tick();
    expect(fixture.vectorCount()).toBe(6);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(installation.internalId);
    expect((await fixture.index.getStatus()).semantic.state).toBe('available');
    expect(fixture.inference.leaseCounts).toEqual([0, 0]);
  });

  it('waits for background exit before querying and resumes from a fresh source snapshot', async () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.seed();
    fixture.add('b');
    await fixture.index.reconcile();
    await tick();
    const background = fixture.inference.calls[0];
    background.holdAbort = true;

    const result = fixture.index.search({ query: 'different words', scope: library });
    await nextTurn();
    expect(background.signal.aborted).toBe(true);
    expect(fixture.inference.calls).toHaveLength(1);
    fixture.change('b', '最新の判断');
    fixture.project('b');
    background.exit();
    await nextTurn();
    expect(fixture.inference.calls[1].request.purpose).toBe('query');
    expect(fixture.inference.trace.slice(0, 4)).toEqual([
      'document:start',
      'document:abort',
      'document:exit',
      'query:start',
    ]);
    fixture.inference.calls[1].complete();
    expect((await result).mode).toBe('hybrid');
    await tick();
    expect(fixture.inference.calls[2].request).toEqual({
      purpose: 'document',
      texts: ['最新の判断'],
    });
    expect(fixture.inference.leaseCounts).toEqual([0, 0, 0]);
    expect(fixture.logError).not.toHaveBeenCalled();
  });

  it('does not resume background work when canceled queries still wait for native exit', async () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.seed();
    fixture.add('b');
    await fixture.index.reconcile();
    await tick();
    const background = fixture.inference.calls[0];
    background.holdAbort = true;
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = rejected(
      fixture.index.search({ query: 'first', scope: library }, { signal: firstController.signal }),
    );
    const second = rejected(
      fixture.index.search(
        { query: 'second', scope: library },
        { signal: secondController.signal },
      ),
    );
    firstController.abort();
    await nextTurn();
    await tick();
    expect(fixture.inference.calls).toHaveLength(1);
    background.exit();
    await nextTurn();
    expect(await first).toMatchObject({ name: 'AbortError' });
    const query = fixture.inference.calls[1];
    expect(query.request).toEqual({ purpose: 'query', texts: ['second'] });
    query.holdAbort = true;
    secondController.abort();
    await tick();
    expect(fixture.inference.calls).toHaveLength(2);
    query.exit();
    expect(await second).toMatchObject({ name: 'AbortError' });
    await tick();
    expect(fixture.inference.calls[2].request.purpose).toBe('document');
    expect(fixture.logError).not.toHaveBeenCalled();
  });

  it('rejects inference from an old database generation and resumes its uncommitted gap', async () => {
    const fixture = createFixture();
    fixture.add('a');
    await fixture.index.reconcile();
    await tick();
    fixture.generation += 1;
    fixture.inference.calls[0].complete();
    await nextTurn();
    expect(fixture.vectorCount()).toBe(0);
    expect(fixture.logInfo).toHaveBeenCalledWith('reading_memory.semantic_batch_indexed', {
      modelVersion: installation.internalId,
      requestedCount: 1,
      writtenCount: 0,
    });
    await tick(5_000);
    fixture.inference.calls[1].complete();
    await nextTurn();
    expect(fixture.vectorCount()).toBe(1);
  });

  it('waits for old inference before resetting every derived index and resumes from the rebuilt projection', async () => {
    const fixture = createFixture(controlledInstallation, installation);
    fixture.add('a');
    fixture.seed(installation);
    activateReadingMemoryModelVersion(fixture.database, model(installation));
    const original = fixture.database.prepare('SELECT * FROM annotations').all();
    await fixture.index.reconcile();
    await tick();
    const pending = fixture.inference.calls[0];
    pending.holdAbort = true;
    let rebuilt = false;

    const rebuild = fixture.index.rebuild().then(() => {
      rebuilt = true;
    });
    await nextTurn();
    expect(pending.signal.aborted).toBe(true);
    expect(rebuilt).toBe(false);
    expect(fixture.vectorCount(installation)).toBe(1);
    pending.complete();
    await rebuild;

    const resetStatus = await fixture.index.getStatus();
    expect(fixture.vectorCount(installation)).toBe(0);
    expect(fixture.vectorCount()).toBe(0);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBeNull();
    expect(resetStatus.projection).toEqual({
      state: 'not_built',
      coverage: { projectedAssetCount: 0, eligibleAssetCount: 1 },
    });
    expect(resetStatus.semantic.state).toBe('building');
    expect(fixture.database.prepare('SELECT * FROM annotations').all()).toEqual(original);
    runReadingMemoryEvidenceProjectionBatch(fixture.database);
    await tick();
    fixture.inference.calls[1].complete();
    await nextTurn();
    await tick();

    expect(fixture.vectorCount()).toBe(1);
    expect((await fixture.index.getStatus()).semantic.state).toBe('available');
    expect(fixture.database.prepare('SELECT * FROM annotations').all()).toEqual(original);
    expect(fixture.logError).not.toHaveBeenCalled();
  });

  it('backs off when a source changed before its projection was repaired', async () => {
    const fixture = createFixture();
    fixture.add('a');
    await fixture.index.reconcile();
    await tick();
    fixture.change('a', 'Revised source');
    fixture.inference.calls[0].complete();
    await nextTurn();
    expect(fixture.vectorCount()).toBe(0);
    expect(fixture.logInfo).toHaveBeenCalledWith('reading_memory.semantic_batch_indexed', {
      modelVersion: installation.internalId,
      requestedCount: 1,
      writtenCount: 0,
    });
    await tick(1);
    expect(fixture.inference.calls, JSON.stringify(fixture.logInfo.mock.calls)).toHaveLength(1);
    expect((await fixture.index.getStatus()).semantic.state).not.toBe('failed');
    fixture.project('a');
    await tick(4_999);
    expect(fixture.inference.calls[1].request.texts).toEqual(['Revised source']);
    fixture.inference.calls[1].complete();
    await nextTurn();
    expect(fixture.vectorCount()).toBe(1);
  });

  it('waits for both inference instances during suspension and cannot restart after disposal', async () => {
    const fixture = createFixture();
    fixture.add('a');
    await fixture.index.reconcile();
    await tick();
    fixture.inference.calls[0].complete();
    await nextTurn();
    const result = fixture.index.search({ query: 'related', scope: library });
    await nextTurn();
    fixture.inference.calls[1].complete();
    await result;
    expect(fixture.inference.instances).toHaveLength(2);
    for (const instance of fixture.inference.instances) instance.holdDispose = true;
    let suspended = false;
    const suspension = fixture.index.suspend().then(() => {
      suspended = true;
    });
    await nextTurn();
    expect(fixture.inference.instances.every((instance) => instance.disposeStarted)).toBe(true);
    expect(suspended).toBe(false);
    for (const instance of fixture.inference.instances) instance.releaseDispose();
    await suspension;
    await tick(60_000);
    expect(fixture.inference.calls).toHaveLength(2);
    await expect(fixture.index.search({ query: 'stopped', scope: library })).rejects.toMatchObject({
      name: 'AbortError',
    });

    fixture.add('b');
    await fixture.index.resume();
    await tick();
    const resumed = fixture.inference.calls[2];
    expect(resumed.request.texts).toEqual(['Evidence b']);
    resumed.holdAbort = true;
    let disposed = false;
    const disposal = fixture.index.dispose();
    expect(fixture.index.dispose()).toBe(disposal);
    void disposal.then(() => {
      disposed = true;
    });
    await nextTurn();
    expect(disposed).toBe(false);
    expect(resumed.signal.aborted).toBe(true);
    resumed.exit();
    await disposal;
    await fixture.index.resume();
    fixture.index.resumeIndexing();
    await tick(60_000);
    expect(fixture.inference.instances).toHaveLength(3);
    expect(fixture.model.disposed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps controlled old-model queries until complete coverage and releases them before cleanup', async () => {
    const target = controlledInstallation;
    const fixture = createFixture(target, installation);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) fixture.add(id);
    fixture.seed(installation);
    expect(activateReadingMemoryModelVersion(fixture.database, model(installation))).toBe(true);
    await fixture.index.reconcile();
    const query = fixture.index.search({ query: 'old model', scope: library });
    await nextTurn();
    fixture.inference.calls[0].complete();
    expect((await query).semantic.queryModelVersion).toBe(installation.internalId);
    const oldQuery = fixture.inference.instances[0];
    expect(oldQuery.installation.internalId).toBe(installation.internalId);
    await tick();
    expect(fixture.inference.calls[1].installation.internalId).toBe(target.internalId);
    fixture.inference.calls[1].complete();
    await nextTurn();
    expect((await fixture.index.getStatus()).semantic).toMatchObject({
      state: 'rebuilding',
      coverage: { indexedEntryCount: 4, eligibleEntryCount: 6 },
    });
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(installation.internalId);
    await tick();
    fixture.inference.calls[2].complete();
    await nextTurn();
    oldQuery.holdDispose = true;
    await tick();
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(target.internalId);
    expect(oldQuery.disposeStarted).toBe(true);
    expect(fixture.vectorCount(installation)).toBe(6);
    expect(fixture.previous?.removed).toBe(false);
    const currentQuery = fixture.index.search({ query: 'new model', scope: library });
    await nextTurn();
    expect(fixture.inference.calls).toHaveLength(3);
    oldQuery.releaseDispose();
    await nextTurn();
    expect(fixture.inference.calls[3].installation.internalId).toBe(target.internalId);
    fixture.inference.calls[3].complete();
    expect((await currentQuery).semantic.queryModelVersion).toBe(target.internalId);
    await tick();
    expect(fixture.vectorCount(installation)).toBe(0);
    expect(fixture.previous?.removed).toBe(true);
    expect(fixture.previous?.vectorsAtRemoval).toBe(0);
    expect((await fixture.index.getStatus()).semantic.state).toBe('available');
  });

  it('waits for the retiring query instance when suspension interrupts a model change', async () => {
    const fixture = createFixture(controlledInstallation, installation);
    fixture.add('a');
    fixture.seed(installation);
    fixture.seed(controlledInstallation);
    activateReadingMemoryModelVersion(fixture.database, model(installation));
    await fixture.index.pauseIndexing();
    const first = fixture.index.search({ query: 'previous model', scope: library });
    await nextTurn();
    fixture.inference.calls[0].complete();
    await first;
    const retiring = fixture.inference.instances[0];
    retiring.holdDispose = true;
    activateReadingMemoryModelVersion(fixture.database, model(controlledInstallation));
    const next = rejected(fixture.index.search({ query: 'target model', scope: library }));
    await nextTurn();
    expect(retiring.disposeStarted).toBe(true);
    let suspended = false;
    const suspension = fixture.index.suspend().then(() => {
      suspended = true;
    });
    await nextTurn();
    expect(suspended).toBe(false);
    expect(fixture.inference.instances).toHaveLength(1);
    retiring.releaseDispose();
    await suspension;
    expect(await next).toMatchObject({ name: 'AbortError' });
    expect(fixture.inference.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never loads an unknown active version and falls back to verified vectors or keywords', async () => {
    const fixture = createFixture();
    fixture.add('a', 'Reading memory works offline');
    fixture.seed();
    fixture.database
      .prepare('INSERT INTO reading_memory_semantic_state (id, active_model_version) VALUES (1, ?)')
      .run('untrusted-model-version');
    const query = fixture.index.search({ query: 'Reading memory', scope: library });
    await nextTurn();
    expect(fixture.inference.calls[0].installation.internalId).toBe(installation.internalId);
    fixture.inference.calls[0].complete();
    expect((await query).mode).toBe('hybrid');
    fixture.model.state = {
      status: 'not-installed',
      internalId: installation.internalId,
      downloadSizeBytes: installation.downloadSizeBytes,
      resumeBytes: 0,
    };
    const fallback = await fixture.index.search({ query: 'Reading memory', scope: library });
    expect(fallback.mode).toBe('keyword');
    expect(fallback.evidence.map((entry) => entry.location.annotationId)).toEqual(['a']);
    expect(fallback.semantic.state).toBe('not_installed');
    expect(fixture.inference.calls).toHaveLength(1);
  });

  it.each(['reconcile', 'resume'] as const)(
    'serves existing keywords during %s while a model downloads',
    async (operation) => {
      const fixture = createFixture();
      fixture.add('a', 'Reading memory works offline');
      if (operation === 'resume') await fixture.index.suspend();
      fixture.model.state = {
        status: 'downloading',
        source: 'modelscope',
        internalId: installation.internalId,
        downloadSizeBytes: installation.downloadSizeBytes,
        downloadedBytes: 1,
      };
      const download = deferred<ReadingMemoryModelLifecycleState>();
      const trace: string[] = [];
      fixture.model.lifecycle.reconcile = async () => {
        trace.push('reconcile:waiting-for-download');
        return download.promise;
      };
      const reconciliation =
        operation === 'resume'
          ? fixture.index.resume()
          : fixture.index.reconcile('database-restored');
      await nextTurn();
      trace.push('query:requested');
      const query = fixture.index
        .search({ query: 'Reading memory', scope: library })
        .then((result) => {
          trace.push(`query:${result.mode}`);
          return result;
        });
      await nextTurn();
      const beforeDownloadCompleted = [...trace];
      trace.push('download:completed');
      fixture.model.state = installation;
      download.resolve(fixture.model.state);
      await reconciliation;
      const result = await query;
      expect(beforeDownloadCompleted, JSON.stringify(trace)).toContain('query:keyword');
      expect(result.evidence.map((entry) => entry.location.annotationId)).toEqual(['a']);
      expect(result.semantic.state).toBe('downloading');
      expect(fixture.inference.instances).toHaveLength(0);
    },
  );

  it('serves a verified previous index during download and stays disposed when reconciliation completes', async () => {
    const fixture = createFixture(controlledInstallation, installation);
    fixture.add('a');
    fixture.seed(installation);
    activateReadingMemoryModelVersion(fixture.database, model(installation));
    fixture.model.state = {
      status: 'downloading',
      source: 'modelscope',
      internalId: controlledInstallation.internalId,
      downloadSizeBytes: controlledInstallation.downloadSizeBytes,
      downloadedBytes: 1,
    };
    const download = deferred<ReadingMemoryModelLifecycleState>();
    fixture.model.lifecycle.reconcile = async () => download.promise;
    const reconciliation = fixture.index.reconcile('database-restored');
    await nextTurn();
    const query = rejected(fixture.index.search({ query: 'previous judgment', scope: library }));
    await nextTurn();
    const queryBeforeDownloadCompleted = fixture.inference.calls[0];
    queryBeforeDownloadCompleted?.complete();
    await nextTurn();
    let disposed = false;
    const disposal = fixture.index.dispose().then(() => {
      disposed = true;
    });
    await nextTurn();
    const disposedBeforeDownloadCompleted = disposed;
    fixture.model.state = controlledInstallation;
    download.resolve(fixture.model.state);
    await Promise.all([reconciliation, disposal]);

    expect(queryBeforeDownloadCompleted?.installation.internalId).toBe(installation.internalId);
    expect(await query).toMatchObject({
      mode: 'hybrid',
      semantic: { state: 'downloading', queryModelVersion: installation.internalId },
    });
    expect(disposedBeforeDownloadCompleted).toBe(true);
    await tick(60_000);
    expect(fixture.inference.instances).toHaveLength(1);
    expect(fixture.inference.instances[0].disposeStarted).toBe(true);
    expect(fixture.model.disposed).toBe(true);
    expect(fixture.previous?.disposed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('limits UTF-8 input without splitting Chinese, Japanese, or emoji code points', async () => {
    const fixture = createFixture();
    const text = '中日😀'.repeat(7_000);
    fixture.add('a', text);
    await fixture.index.reconcile();
    await tick();
    const submitted = fixture.inference.calls[0].request.texts[0];
    expect(submitted).toBe('中日😀'.repeat(6_553) + '中日');
    expect(Buffer.byteLength(submitted, 'utf8')).toBe(65_536);
    expect(Buffer.from(submitted, 'utf8').toString('utf8')).toBe(submitted);
    const [source] = readStoredAnnotationThreadSources(fixture.database, ['a']);
    expect(source.annotation.anchor.exact).toBe(text);
    fixture.inference.calls[0].complete();
    await nextTurn();
    expect(fixture.vectorCount()).toBe(1);
  });

  it('retries real inference failures after thirty seconds and does not log cancellation as failure', async () => {
    const fixture = createFixture();
    fixture.add('a');
    await fixture.index.reconcile();
    await tick();
    const failure = new Error('controlled native failure');
    fixture.inference.calls[0].fail(failure);
    await nextTurn();
    expect(fixture.logError).toHaveBeenCalledExactlyOnceWith(
      'reading_memory.semantic_index_failed',
      failure,
    );
    expect((await fixture.index.getStatus()).semantic.state).toBe('failed');
    await tick(29_999);
    expect(fixture.inference.calls).toHaveLength(1);
    await tick(1);
    expect(fixture.inference.calls).toHaveLength(2);
    await fixture.index.pauseIndexing();
    expect(fixture.logError).toHaveBeenCalledTimes(1);
    fixture.index.resumeIndexing();
    await tick();
    fixture.inference.calls[2].complete();
    await nextTurn();
    await tick();
    expect((await fixture.index.getStatus()).semantic.state).toBe('available');
  });
});

async function tick(milliseconds = 0) {
  await vi.advanceTimersByTimeAsync(milliseconds);
  await nextTurn();
}

function rejected(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function model(selected = installation) {
  return { modelVersion: selected.internalId, dimension: selected.manifest.vector.dimension };
}

function vectors(count: number, dimension: number) {
  const result = new Float32Array(count * dimension);
  for (let index = 0; index < count; index += 1) result[index * dimension] = 1;
  return result;
}

function createModel(initial: ReadingMemoryModelInstallation, countVectors: () => number) {
  const owner = {
    state: initial as ReadingMemoryModelLifecycleState,
    disposed: false,
    removed: false,
    vectorsAtRemoval: -1,
  };
  const lifecycle: ReadingMemoryModelLifecycle = {
    getState: () => owner.state,
    reconcile: async () => owner.state,
    download: async () => owner.state,
    cancelDownload: async () => owner.state,
    remove: async () => {
      owner.removed = true;
      owner.vectorsAtRemoval = countVectors();
      owner.state = {
        status: 'not-installed',
        internalId: initial.internalId,
        downloadSizeBytes: initial.downloadSizeBytes,
        resumeBytes: 0,
      };
      return owner.state;
    },
    dispose: () => {
      owner.disposed = true;
    },
  };
  return Object.assign(owner, { lifecycle });
}

class ControlledCall {
  readonly result = deferred<ReadingMemoryEmbeddingResult>();
  readonly installation: ReadingMemoryModelInstallation;
  holdAbort = false;
  settled = false;

  constructor(
    selected: ReadingMemoryModelInstallation,
    readonly request: ReadingMemoryEmbeddingRequest,
    readonly signal: AbortSignal,
    private readonly trace: string[],
  ) {
    this.installation = selected;
    trace.push(`${request.purpose}:start`);
    signal.addEventListener(
      'abort',
      () => {
        if (this.settled) return;
        trace.push(`${request.purpose}:abort`);
        if (!this.holdAbort) this.exit();
      },
      { once: true },
    );
  }

  complete() {
    this.settled = true;
    this.trace.push(`${this.request.purpose}:complete`);
    this.result.resolve({
      modelVersion: this.installation.internalId,
      dimension: this.installation.manifest.vector.dimension,
      vectors: vectors(this.request.texts.length, this.installation.manifest.vector.dimension),
    });
  }

  fail(error: unknown) {
    this.settled = true;
    this.result.reject(error);
  }

  exit() {
    if (this.settled) return;
    this.trace.push(`${this.request.purpose}:exit`);
    this.fail(this.signal.reason ?? new DOMException('Native process exited', 'AbortError'));
  }
}

function createInference(readLeaseCount: () => number) {
  const calls: ControlledCall[] = [];
  const instances: {
    installation: ReadingMemoryModelInstallation;
    holdDispose: boolean;
    disposeStarted: boolean;
    releaseDispose: () => void;
  }[] = [];
  const trace: string[] = [];
  const leaseCounts: number[] = [];
  return {
    calls,
    instances,
    trace,
    leaseCounts,
    createEmbedding: (selected: ReadingMemoryModelInstallation): ReadingMemoryEmbeddingService => {
      const release = deferred<void>();
      const owned: ControlledCall[] = [];
      const instance = {
        installation: selected,
        holdDispose: false,
        disposeStarted: false,
        releaseDispose: () => release.resolve(),
      };
      instances.push(instance);
      return {
        embed(request, options) {
          leaseCounts.push(readLeaseCount());
          if (!options?.signal) throw new Error('Missing cancellation signal');
          const call = new ControlledCall(selected, request, options.signal, trace);
          calls.push(call);
          owned.push(call);
          return call.result.promise;
        },
        async dispose() {
          instance.disposeStarted = true;
          for (const call of owned) if (!call.holdAbort) call.exit();
          if (instance.holdDispose) await release.promise;
          await Promise.allSettled(owned.map((call) => call.result.promise));
        },
      };
    },
    releaseAll() {
      for (const call of calls) call.exit();
      for (const instance of instances) instance.releaseDispose();
    },
  };
}

function createFixture(
  target = installation,
  previousInstallation?: ReadingMemoryModelInstallation,
) {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  let leases = 0;
  const state = { generation: 1 };
  const withDatabase: ReadingMemoryDatabase = async (operation) => {
    leases += 1;
    try {
      return operation(database, state.generation);
    } finally {
      leases -= 1;
    }
  };
  const vectorCount = (selected = target) => {
    const result = database
      .prepare(
        'SELECT count(*) AS count FROM reading_memory_evidence_vectors WHERE model_version = ?',
      )
      .get(selected.internalId) as { count: number };
    return result.count;
  };
  const lifecycle = createModel(target, () => vectorCount(target));
  const previous = previousInstallation
    ? createModel(previousInstallation, () => vectorCount(previousInstallation))
    : undefined;
  const inference = createInference(() => leases);
  const logInfo = vi.fn();
  const logError = vi.fn();
  const index: ReadingMemorySemanticIndex = createReadingMemorySemanticIndex({
    modelLifecycle: lifecycle.lifecycle,
    previousModelLifecycle: previous?.lifecycle,
    withDatabase,
    createEmbedding: inference.createEmbedding,
    logInfo,
    logError,
  });
  const fixture = {
    database,
    index,
    inference,
    model: lifecycle,
    previous,
    logInfo,
    logError,
    vectorCount,
    get generation() {
      return state.generation;
    },
    set generation(value: number) {
      state.generation = value;
    },
    add(id: string, text = `Evidence ${id}`) {
      database
        .prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`)
        .run(
          `article_${id}`,
          `https://example.com/${id}`,
          `https://example.com/${id}`,
          id,
          id,
          timestamp,
          timestamp,
        );
      database
        .prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`)
        .run(id, `article_${id}`, anchor(text), timestamp, timestamp);
      fixture.project(id);
    },
    change(id: string, text: string) {
      database.prepare('UPDATE annotations SET anchor = ? WHERE id = ?').run(anchor(text), id);
    },
    project(id: string) {
      const [source] = readStoredAnnotationThreadSources(database, [id]);
      const projectorVersion = readingMemoryEvidenceProjectorVersion;
      database.transaction(() =>
        replaceReadingEvidenceThreadInTransaction(
          database,
          {
            targetId: id,
            articleId: source.articleId,
            sourceVersion: source.sourceVersion,
            projectorVersion,
            projectedAt: timestamp,
          },
          projectReadingEvidenceThread({
            articleId: source.articleId,
            annotation: source.annotation,
            sourceVersion: source.sourceVersion,
            projectorVersion,
          }),
        ),
      )();
    },
    seed(selected = target) {
      const entries = readMissingReadingMemoryVectors(database, { ...model(selected), limit: 100 });
      writeReadingMemoryVectors(database, {
        ...model(selected),
        entries,
        vectors: vectors(entries.length, selected.manifest.vector.dimension),
      });
    },
  };
  cleanups.push(async () => {
    const disposal = index.dispose();
    inference.releaseAll();
    await disposal;
    database.close();
  });
  return fixture;
}

function anchor(text: string) {
  return JSON.stringify({ exact: text, prefix: '', suffix: '', start: 0, end: text.length });
}
