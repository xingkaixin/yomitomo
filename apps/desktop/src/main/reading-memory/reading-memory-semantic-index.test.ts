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
import { readActiveReadingMemoryModelVersion } from './reading-memory-vector-store';

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
