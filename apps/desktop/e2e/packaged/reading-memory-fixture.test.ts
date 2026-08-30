import { fork, type ChildProcess } from 'node:child_process';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createReadingMemoryEmbeddingService } from '../../src/main/reading-memory/reading-memory-embedding-service';
import { createReadingMemoryModelLifecycle } from './reading-memory-fixture-model';

const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).toReversed()) await cleanup();
  vi.unstubAllEnvs();
});

describe('packaged reading memory fixture', () => {
  it('installs verified bytes once and does not undo model removal', async () => {
    const lifecycle = await createLifecycle('available');
    const state = await lifecycle.reconcile('startup');
    expect(state.status).toBe('available');
    if (state.status !== 'available') throw new Error('Fixture installation failed');
    expect(state.internalId).toBe('reading-memory-fixture-v1');
    const modelFile = state.manifest.artifact.files[0];
    const bytes = await readFile(join(state.directory, modelFile.path));
    expect(bytes.byteLength).toBe(modelFile.sizeBytes);
    expect(bytes.toString('utf8')).toContain('this is not an ONNX model');
    expect(await lifecycle.remove()).toMatchObject({ status: 'not-installed' });
    expect(await lifecycle.reconcile('resume')).toMatchObject({ status: 'not-installed' });
  });

  it('retains real partial bytes on cancellation and resumes with a fresh lifecycle', async () => {
    const lifecycle = await createLifecycle('not-installed');
    expect(await lifecycle.reconcile('startup')).toMatchObject({ status: 'not-installed' });
    const download = lifecycle.download();
    await vi.waitFor(
      () => {
        const state = lifecycle.getState();
        expect(state.status).toBe('downloading');
        if (state.status === 'downloading') expect(state.downloadedBytes).toBeGreaterThan(0);
      },
      { interval: 5 },
    );
    const canceled = await lifecycle.cancelDownload();
    await download;
    expect(canceled).toMatchObject({ status: 'not-installed', resumeBytes: expect.any(Number) });
    if (canceled.status !== 'not-installed') throw new Error('Fixture cancellation failed');
    expect(canceled.resumeBytes).toBeGreaterThan(0);
    const resumed = createReadingMemoryModelLifecycle({ userDataPath: lifecycle.userDataPath });
    cleanups.push(() => resumed.dispose());
    expect(await resumed.reconcile('database-restored')).toMatchObject({
      status: 'not-installed',
      resumeBytes: canceled.resumeBytes,
    });
    expect(await resumed.download()).toMatchObject({ status: 'available' });
  });

  it('detects installed corruption instead of replacing the real integrity result', async () => {
    const lifecycle = await createLifecycle('available');
    const state = await lifecycle.reconcile('startup');
    if (state.status !== 'available') throw new Error('Fixture installation failed');
    const file = state.manifest.artifact.files[0];
    await writeFile(join(state.directory, file.path), Buffer.alloc(file.sizeBytes));
    expect(await lifecycle.reconcile('database-restored')).toMatchObject({
      status: 'failed',
      failure: 'integrity',
    });
  });

  it('reports transport failure only when the user requests a download', async () => {
    const lifecycle = await createLifecycle('download-failed');
    expect(await lifecycle.reconcile('startup')).toMatchObject({ status: 'not-installed' });
    expect(await lifecycle.download()).toMatchObject({ status: 'failed', failure: 'network' });
  });

  it('passes cross-language fixture vectors through the real child-process service', async () => {
    const { service, children } = await createEmbedding();
    const document = await service.embed({
      purpose: 'document',
      texts: [
        'Saved reading judgments',
        '证据与观点',
        '読書の根拠',
        'Astronomy stars',
        'Unrelated',
      ],
    });
    expect(document.modelVersion).toBe('reading-memory-fixture-v1');
    expect(document.dimension).toBe(768);
    expect(document.vectors).toHaveLength(5 * 768);
    expect(document.vectors.slice(0, 768)).toEqual(document.vectors.slice(768, 2 * 768));
    expect(document.vectors.slice(0, 768)).toEqual(document.vectors.slice(2 * 768, 3 * 768));
    expect(document.vectors[0]).toBe(1);
    expect(document.vectors[3 * 768 + 1]).toBe(1);
    expect(document.vectors[4 * 768 + 2]).toBe(1);
    const query = await service.embed({ purpose: 'query', texts: ['阅读证据', '阅读宇宙'] });
    expect(query.vectors.slice(0, 768)).toEqual(document.vectors.slice(0, 768));
    expect(query.vectors[768]).toBeCloseTo(1 / Math.sqrt(2));
    expect(query.vectors[769]).toBeCloseTo(1 / Math.sqrt(2));
    expect(children).toHaveLength(1);
    await service.dispose();
    expect(children[0].exitCode !== null || children[0].signalCode !== null).toBe(true);
  });

  it('reports a controlled worker failure through the real embedding service', async () => {
    const { service, children } = await createEmbedding(['--embedding-failed']);
    await expect(
      service.embed({ purpose: 'query', texts: ['reading evidence'] }),
    ).rejects.toMatchObject({
      code: 'READING_MEMORY_EMBEDDING_WORKER_FAILED',
    });
    expect(children[0].exitCode !== null || children[0].signalCode !== null).toBe(true);
  });
});

async function createLifecycle(scenario: string) {
  vi.stubEnv('YOMITOMO_READING_MEMORY_FIXTURE_SCENARIO', scenario);
  const userDataPath = await mkdtemp(join(tmpdir(), 'yomitomo-fixture-model-'));
  cleanups.push(() => rm(userDataPath, { recursive: true, force: true }));
  const lifecycle = createReadingMemoryModelLifecycle({ userDataPath });
  cleanups.push(() => lifecycle.dispose());
  return { ...lifecycle, userDataPath };
}

async function createEmbedding(args: string[] = []) {
  const lifecycle = await createLifecycle('available');
  const state = await lifecycle.reconcile('startup');
  if (state.status !== 'available') throw new Error('Fixture installation failed');
  const children: ChildProcess[] = [];
  const service = createReadingMemoryEmbeddingService(state, {
    createProcess(_workerUrl, processOptions) {
      const child = fork(
        new URL('./reading-memory-fixture-worker.ts', import.meta.url),
        args,
        processOptions,
      );
      children.push(child);
      return child;
    },
  });
  cleanups.push(() => service.dispose());
  return { service, children };
}
