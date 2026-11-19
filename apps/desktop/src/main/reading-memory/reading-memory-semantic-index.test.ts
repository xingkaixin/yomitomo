import { readFileSync } from 'node:fs';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import type { ReadingMemoryModelInstallation } from './reading-memory-embedding-service';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import type { ReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';
import { createReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import type { ReadingMemoryDatabase } from './reading-memory-store-types';
import {
  activateReadingMemoryModelVersion,
  readActiveReadingMemoryModelVersion,
  readMissingReadingMemoryVectors,
  writeReadingMemoryVectors,
} from './reading-memory-vector-store';

const timestamp = '2026-08-30T00:00:00.000Z';
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
const cleanups: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

it('indexes evidence that changes while the indexer finishes its last pass', async () => {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  addAnnotation(database, 'first');
  let changedDuringActivation = false;
  const withDatabase: ReadingMemoryDatabase = async (operation) => {
    const wasActive = readActiveReadingMemoryModelVersion(database) !== null;
    const result = operation(database, 0);
    if (!wasActive && readActiveReadingMemoryModelVersion(database) !== null) {
      changedDuringActivation = true;
      addAnnotation(database, 'second');
      index.notifyEvidenceChanged();
    }
    return result;
  };
  const modelLifecycle: ReadingMemoryModelLifecycle = {
    getState: () => installation,
    reconcile: async () => installation,
    download: async () => installation,
    cancelDownload: async () => installation,
    remove: async () => installation,
    dispose: vi.fn(),
  };
  const dimension = manifest.vector.dimension;
  const index = createReadingMemorySemanticIndex({
    modelLifecycle,
    withDatabase,
    createEmbedding: () => ({
      embed: async ({ texts }) => {
        const vectors = new Float32Array(texts.length * dimension);
        for (let row = 0; row < texts.length; row += 1) vectors[row * dimension] = 1;
        return { modelVersion: manifest.internalId, dimension, vectors };
      },
      dispose: async () => {},
    }),
  });
  cleanups.push(async () => {
    await index.dispose();
    database.close();
  });

  index.notifyEvidenceChanged();

  await vi.waitFor(async () => {
    expect(changedDuringActivation).toBe(true);
    const { semantic } = await index.getStatus();
    expect(semantic.coverage.eligibleEntryCount).toBe(2);
    expect(semantic.state).toBe('available');
  });
});

it('reuses a single embedding service across document indexing and search queries for the same model', async () => {
  const database = createDatabase();
  addAnnotation(database, 'shared');
  const purposes: string[] = [];
  const createEmbedding = vi.fn((model: ReadingMemoryModelInstallation) => ({
    embed: async ({ purpose, texts }: { purpose: string; texts: readonly string[] }) => {
      purposes.push(purpose);
      return unitEmbedding(model, texts.length);
    },
    dispose: vi.fn(async () => {}),
  }));
  const index = createReadingMemorySemanticIndex({
    modelLifecycle: staticLifecycle(installation),
    withDatabase: async (operation) => operation(database, 0),
    createEmbedding,
  });
  cleanups.push(async () => {
    await index.dispose();
    database.close();
  });

  index.notifyEvidenceChanged();
  await vi.waitFor(async () => {
    expect((await index.getStatus()).semantic.state).toBe('available');
  });

  const result = await index.search({ query: 'reading memory', scope: { kind: 'library' } });
  expect(result.mode).toBe('hybrid');
  expect(createEmbedding).toHaveBeenCalledTimes(1);
  expect(purposes).toEqual(['document', 'query']);
});

it('keeps previous and target model services isolated during upgrade and retires the previous instance', async () => {
  const database = createDatabase();
  addAnnotation(database, 'first');
  const previousInstallation: ReadingMemoryModelInstallation = {
    ...installation,
    internalId: 'reading-memory-embedding-v0',
    directory: '/tmp/yomitomo-semantic-index-test/model-v0',
    manifest: {
      ...manifest,
      internalId: 'reading-memory-embedding-v0' as typeof manifest.internalId,
    },
  };
  const previousModel = {
    modelVersion: previousInstallation.internalId,
    dimension: manifest.vector.dimension,
  };
  const missing = readMissingReadingMemoryVectors(database, { ...previousModel, limit: 10 });
  const seedVectors = new Float32Array(missing.length * previousModel.dimension);
  for (let row = 0; row < missing.length; row += 1) seedVectors[row * previousModel.dimension] = 1;
  writeReadingMemoryVectors(database, { ...previousModel, entries: missing, vectors: seedVectors });
  expect(activateReadingMemoryModelVersion(database, previousModel)).toBe(true);

  let previousInstalled = true;
  const removePrevious = vi.fn(async () => {
    previousInstalled = false;
    return {
      status: 'not-installed' as const,
      internalId: previousInstallation.internalId,
      downloadSizeBytes: previousInstallation.downloadSizeBytes,
      resumeBytes: 0,
    };
  });
  const previousModelLifecycle: ReadingMemoryModelLifecycle = {
    getState: () =>
      previousInstalled
        ? previousInstallation
        : {
            status: 'not-installed',
            internalId: previousInstallation.internalId,
            downloadSizeBytes: previousInstallation.downloadSizeBytes,
            resumeBytes: 0,
          },
    reconcile: async () => previousModelLifecycle.getState(),
    download: async () => previousInstallation,
    cancelDownload: async () => previousModelLifecycle.getState(),
    remove: removePrevious,
    dispose: vi.fn(),
  };

  const servicesByModel = new Map<
    string,
    { purposes: string[]; dispose: ReturnType<typeof vi.fn<() => Promise<void>>> }
  >();
  const createEmbedding = vi.fn((model: ReadingMemoryModelInstallation) => {
    const tracker = { purposes: [] as string[], dispose: vi.fn(async () => {}) };
    servicesByModel.set(model.internalId, tracker);
    return {
      embed: async ({ purpose, texts }: { purpose: string; texts: readonly string[] }) => {
        tracker.purposes.push(purpose);
        return unitEmbedding(model, texts.length);
      },
      dispose: tracker.dispose,
    };
  });

  const index = createReadingMemorySemanticIndex({
    modelLifecycle: staticLifecycle(installation),
    previousModelLifecycle,
    withDatabase: async (operation) => operation(database, 0),
    createEmbedding,
  });
  cleanups.push(async () => {
    await index.dispose();
    database.close();
  });

  // Pause target indexing so the first search runs against the active previous model.
  await index.pauseIndexing();
  const duringUpgrade = await index.search({ query: 'reading memory', scope: { kind: 'library' } });
  expect(duringUpgrade.mode).toBe('hybrid');
  expect(duringUpgrade.semantic.state).toBe('rebuilding');
  expect(duringUpgrade.semantic.queryModelVersion).toBe(previousInstallation.internalId);
  expect(servicesByModel.get(previousInstallation.internalId)?.purposes).toEqual(['query']);

  index.resumeIndexing();
  await vi.waitFor(async () => {
    expect(readActiveReadingMemoryModelVersion(database)).toBe(installation.internalId);
    expect(removePrevious).toHaveBeenCalledTimes(1);
  });

  expect(servicesByModel.get(previousInstallation.internalId)?.dispose).toHaveBeenCalledTimes(1);
  expect(servicesByModel.get(installation.internalId)?.dispose).not.toHaveBeenCalled();

  const afterUpgrade = await index.search({ query: 'reading memory', scope: { kind: 'library' } });
  expect(afterUpgrade.mode).toBe('hybrid');
  expect(afterUpgrade.semantic.state).toBe('available');
  expect(afterUpgrade.semantic.queryModelVersion).toBe(installation.internalId);
  expect(createEmbedding).toHaveBeenCalledTimes(2);
  expect(servicesByModel.get(installation.internalId)?.purposes).toEqual(['document', 'query']);
});

function createDatabase() {
  const database = new SQLiteDatabase(':memory:');
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  return database;
}

function staticLifecycle(model: ReadingMemoryModelInstallation): ReadingMemoryModelLifecycle {
  return {
    getState: () => model,
    reconcile: async () => model,
    download: async () => model,
    cancelDownload: async () => model,
    remove: async () => model,
    dispose: vi.fn(),
  };
}

function unitEmbedding(model: ReadingMemoryModelInstallation, count: number) {
  const dimension = model.manifest.vector.dimension;
  const vectors = new Float32Array(count * dimension);
  for (let row = 0; row < count; row += 1) vectors[row * dimension] = 1;
  return { modelVersion: model.internalId, dimension, vectors };
}

function addAnnotation(database: SQLiteDatabase.Database, id: string) {
  const articleId = `article_${id}`;
  database
    .prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`)
    .run(
      articleId,
      `https://example.com/${id}`,
      `https://example.com/${id}`,
      id,
      id,
      timestamp,
      timestamp,
    );
  const exact = `reading memory ${id}`;
  database
    .prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`)
    .run(
      id,
      articleId,
      JSON.stringify({ exact, prefix: '', suffix: '', start: 0, end: exact.length }),
      timestamp,
      timestamp,
    );
  const [source] = readStoredAnnotationThreadSources(database, [id]);
  replaceReadingEvidenceThreadInTransaction(
    database,
    {
      targetId: id,
      articleId,
      sourceVersion: source.sourceVersion,
      projectorVersion: readingMemoryEvidenceProjectorVersion,
      projectedAt: timestamp,
    },
    projectReadingEvidenceThread({
      articleId,
      annotation: source.annotation,
      sourceVersion: source.sourceVersion,
      projectorVersion: readingMemoryEvidenceProjectorVersion,
    }),
  );
}
