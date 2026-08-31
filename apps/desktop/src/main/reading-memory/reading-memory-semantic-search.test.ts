import { readFileSync } from 'node:fs';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type { ReadingEvidenceScope, ReadingMemorySemanticStatus } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import {
  ReadingMemoryEmbeddingError,
  type ReadingMemoryEmbeddingResult,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import { parseReadingMemoryModelManifest } from './reading-memory-model-manifest';
import { searchReadingMemoryEvidence } from './reading-memory-semantic-search';
import type {
  ReadingMemoryDatabase,
  ReadingMemorySqliteExecutor,
} from './reading-memory-store-types';
import {
  activateReadingMemoryModelVersion,
  readReadingMemoryVectorCoverage,
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
  directory: '/tmp/yomitomo-semantic-search-test/model',
  manifest,
};
const model = { modelVersion: manifest.internalId, dimension: manifest.vector.dimension };
const databases: SQLiteDatabase.Database[] = [];
type SearchOptions = Parameters<typeof searchReadingMemoryEvidence>[0];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('reading memory semantic search', () => {
  it('combines different-word evidence with keyword matches and reports partial coverage', async () => {
    const fixture = createFixture();
    fixture.add('semantic', '以前の読書から理解を取り出す');
    fixture.add('keyword', 'Reading memory connects ideas', false);
    fixture.add('pending', '尚未建立向量的证据', false);
    const result = await fixture.search();

    expect(result.mode).toBe('hybrid');
    expect(result.evidence.map((item) => item.location.annotationId).toSorted()).toEqual([
      'keyword',
      'semantic',
    ]);
    expect(result.projection).toEqual({
      state: 'available',
      coverage: { projectedAssetCount: 3, eligibleAssetCount: 3 },
    });
    expect(result.semantic).toMatchObject({
      state: 'building',
      queryModelVersion: model.modelVersion,
      coverage: { indexedEntryCount: 1, eligibleEntryCount: 3 },
    });
  });

  it('uses keywords without starting inference when the model or coverage is absent', async () => {
    const fixture = createFixture();
    fixture.add('keyword', 'Reading memory remains usable offline', false);
    const embedQuery = vi.fn(async () => embedding());
    const unindexed = await fixture.search({ embedQuery });
    expect(unindexed.mode).toBe('keyword');
    expect(unindexed.evidence.map((item) => item.location.annotationId)).toEqual(['keyword']);
    fixture.currentInstallation = null;
    const unavailable = await fixture.search({ embedQuery });
    expect(unavailable.mode).toBe('keyword');
    expect(unavailable.semantic.state).toBe('not_installed');
    expect(unavailable.evidence).toEqual(unindexed.evidence);
    expect(embedQuery).not.toHaveBeenCalled();
  });

  it('rejects changed and deleted sources after inference without waiting for reprojection', async () => {
    const fixture = createFixture();
    fixture.add('changed', 'Original judgment');
    fixture.add('deleted', 'Deleted judgment');
    fixture.add('kept', 'Still current judgment');
    const result = await fixture.search({
      embedQuery: async () => {
        fixture.database
          .prepare('UPDATE annotations SET anchor = ? WHERE id = ?')
          .run(anchor('Revised judgment'), 'changed');
        fixture.database.prepare('DELETE FROM annotations WHERE id = ?').run('deleted');
        return embedding();
      },
    });
    expect(result.mode).toBe('hybrid');
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['kept']);
    expect(JSON.stringify(result.evidence)).not.toContain('Original judgment');
  });

  it('rechecks collection membership after scanning and filters before candidate limits', async () => {
    const fixture = createFixture();
    fixture.populate(300);
    fixture.database
      .prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('selected', 'Selected', timestamp, timestamp);
    fixture.database
      .prepare(
        "INSERT INTO collection_members (collection_id, member_kind, member_id, added_at) SELECT 'selected', 'article', id, ? FROM articles",
      )
      .run(timestamp);
    for (let index = 0; index < 50; index += 1) fixture.add(`outside_${index}`, 'Outside scope');
    const result = await fixture.search({
      scope: { kind: 'collection', collectionId: 'selected' },
      embedQuery: async () => {
        setImmediate(() => {
          fixture.database
            .prepare('DELETE FROM collection_members WHERE member_id = ?')
            .run('article_item_00000');
        });
        return embedding();
      },
    });
    expect(result.mode).toBe('hybrid');
    expect(result.evidence).toHaveLength(12);
    expect(result.evidence.every((item) => item.location.annotationId.startsWith('item_'))).toBe(
      true,
    );
    expect(result.evidence.some((item) => item.location.annotationId === 'item_00000')).toBe(false);
    expect(result.semantic.coverage).toEqual({ indexedEntryCount: 299, eligibleEntryCount: 299 });
  });

  it('requeries the restored database even when asset IDs and model versions are reused', async () => {
    const original = createFixture();
    original.add('same_id', 'Old semantic candidate');
    const restored = createFixture();
    restored.add('same_id', 'Reading memory restored from backup');
    let current = original;
    let generation = 0;
    const withDatabase: ReadingMemoryDatabase = async (operation) =>
      operation(current.database, generation);
    const result = await original.search({
      withDatabase,
      embedQuery: async () => {
        current = restored;
        generation += 1;
        return embedding();
      },
    });
    expect(result.mode).toBe('keyword');
    expect(result.evidence.map((item) => item.content)).toEqual([
      'Reading memory restored from backup',
    ]);
  });

  it.each(['activate', 'replace'] as const)(
    'does not mix candidates when the active model changes: %s',
    async (change) => {
      const fixture = createFixture();
      fixture.add('semantic', 'Semantic-only result');
      fixture.add('keyword', 'Reading memory keyword result');
      if (change === 'replace') activateReadingMemoryModelVersion(fixture.database, model);
      const result = await fixture.search({
        embedQuery: async () => {
          if (change === 'activate') {
            activateReadingMemoryModelVersion(fixture.database, model);
          } else {
            fixture.database
              .prepare('UPDATE reading_memory_semantic_state SET active_model_version = ?')
              .run('replacement-model');
          }
          return embedding();
        },
      });
      expect(result.mode).toBe('keyword');
      expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['keyword']);
      expect(result.semantic.state).not.toBe('failed');
    },
  );

  it('discards scanned candidates if the database generation changes between chunks', async () => {
    const fixture = createFixture();
    fixture.populate(300);
    const result = await fixture.search({
      embedQuery: async () => {
        setImmediate(() => {
          fixture.generation += 1;
          fixture.add('restored', 'Reading memory restored keyword');
        });
        return embedding();
      },
    });
    expect(result.mode).toBe('keyword');
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['restored']);
  });

  it('falls back to current keywords when the model is removed during inference', async () => {
    const fixture = createFixture();
    fixture.add('semantic', 'Only a semantic match');
    fixture.add('keyword', 'Reading memory survives model removal');
    const result = await fixture.search({
      embedQuery: async () => {
        fixture.currentInstallation = null;
        return embedding();
      },
    });
    expect(result.mode).toBe('keyword');
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['keyword']);
    expect(result.semantic.state).toBe('not_installed');
  });

  it('marks inference failure without leaking query or source content into logs', async () => {
    const fixture = createFixture();
    fixture.add('keyword', 'Private reading memory content');
    const logError = vi.fn();
    const result = await fixture.search({
      embedQuery: async () => {
        throw new Error('Failure while embedding Private reading memory content');
      },
      logError,
    });
    expect(result.mode).toBe('keyword');
    expect(result.semantic.state).toBe('failed');
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['keyword']);
    expect(logError).toHaveBeenCalledOnce();
    const logs = logError.mock.calls.flatMap((call) =>
      call.map((value) => (value instanceof Error ? value.stack : JSON.stringify(value))),
    );
    expect(logs.join('\n')).not.toContain('Private');
    expect(logs.join('\n').toLocaleLowerCase()).not.toContain('reading memory');
  });

  it('does not mark the current model failed when an older inference fails after removal', async () => {
    const fixture = createFixture();
    fixture.add('keyword', 'Reading memory remains available');
    const result = await fixture.search({
      embedQuery: async () => {
        fixture.currentInstallation = null;
        throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_WORKER_FAILED');
      },
    });
    expect(result.mode).toBe('keyword');
    expect(result.semantic.state).toBe('not_installed');
    expect(result.evidence.map((item) => item.location.annotationId)).toEqual(['keyword']);
  });

  it('propagates user cancellation before work and during inference or chunk scanning', async () => {
    const fixture = createFixture();
    fixture.populate(300);
    const reason = new Error('User canceled search');
    const canceled = AbortSignal.abort(reason);
    await expect(fixture.search({ signal: canceled })).rejects.toBe(reason);

    const inference = new AbortController();
    await expect(
      fixture.search({
        signal: inference.signal,
        embedQuery: async () => {
          inference.abort(reason);
          throw new ReadingMemoryEmbeddingError('READING_MEMORY_EMBEDDING_CANCELED');
        },
      }),
    ).rejects.toBe(reason);

    const scanning = new AbortController();
    await expect(
      fixture.search({
        signal: scanning.signal,
        embedQuery: async () => {
          setImmediate(() => scanning.abort(reason));
          return embedding();
        },
      }),
    ).rejects.toBe(reason);
  });

  it('keeps result limits bounded for a fully indexed library', async () => {
    const fixture = createFixture();
    fixture.populate(50);
    expect((await fixture.search()).evidence).toHaveLength(12);
    expect((await fixture.search({ limit: 100 })).evidence).toHaveLength(24);
    expect((await fixture.search({ limit: 3 })).evidence).toHaveLength(3);
  });

  it('measures all 10,000 SQLite vectors at the release dimension with a final-chunk match', async () => {
    const fixture = createFixture();
    fixture.populate(10_000);
    fixture.add('unindexed', 'Pending vector', false);
    const lastId = 'item_09999';
    fixture.database
      .prepare('UPDATE reading_memory_evidence_vectors SET vector = ? WHERE evidence_id = ?')
      .run(vectorBytes(1), `reading_evidence_annotation:${lastId}`);
    await fixture.search();
    fixture.leaseDurations.length = 0;
    const durations: number[] = [];
    for (let index = 0; index < 20; index += 1) {
      const startedAt = performance.now();
      const result = await fixture.search();
      durations.push(performance.now() - startedAt);
      expect(result.evidence[0]?.location.annotationId).toBe(lastId);
      expect(result.semantic.coverage).toEqual({
        indexedEntryCount: 10_000,
        eligibleEntryCount: 10_001,
      });
    }
    const p95Ms = durations.toSorted((left, right) => left - right)[
      Math.ceil(durations.length * 0.95) - 1
    ];
    const maximumLeaseMs = Math.max(...fixture.leaseDurations);
    console.info('reading_memory.semantic_search_performance', {
      entryCount: 10_000,
      dimension: model.dimension,
      queryEmbedding: 'injected',
      samples: durations.length,
      p95Ms: Math.round(p95Ms * 100) / 100,
      maximumLeaseMs: Math.round(maximumLeaseMs * 100) / 100,
    });
    expect(model.dimension).toBe(768);
    expect(p95Ms).toBeLessThan(1_000);
  }, 30_000);
});

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  const insertArticle = database.prepare(`
INSERT INTO articles (id, url, canonical_url, title, source_type, content_hash, created_at, updated_at)
VALUES (?, ?, ?, ?, 'web', ?, ?, ?)
`);
  const insertAnnotation = database.prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`);
  const insertVector = database.prepare(`
INSERT INTO reading_memory_evidence_vectors (
  evidence_id, model_version, source_version, projector_version, dimension, vector
) SELECT id, ?, source_version, projector_version, ?, ?
FROM reading_memory_evidence_entries WHERE target_id = ?
`);
  let leased = false;
  const withDatabase: ReadingMemoryDatabase = async (operation) => {
    const startedAt = performance.now();
    leased = true;
    try {
      return operation(database, fixture.generation);
    } finally {
      leased = false;
      fixture.leaseDurations.push(performance.now() - startedAt);
    }
  };
  const fixture = {
    database,
    generation: 0,
    currentInstallation: installation as ReadingMemoryModelInstallation | null,
    leaseDurations: [] as number[],
    add(id: string, content: string, indexed = true, score = 1) {
      const articleId = `article_${id}`;
      insertArticle.run(
        articleId,
        `https://example.com/${id}`,
        `https://example.com/${id}`,
        id,
        id,
        timestamp,
        timestamp,
      );
      insertAnnotation.run(id, articleId, anchor(content), timestamp, timestamp);
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
      if (indexed) insertVector.run(model.modelVersion, model.dimension, vectorBytes(score), id);
    },
    populate(count: number) {
      database.transaction(() => {
        for (let index = 0; index < count; index += 1) {
          fixture.add(
            `item_${String(index).padStart(5, '0')}`,
            `Stored evidence ${index}`,
            true,
            0.5,
          );
        }
      })();
    },
    withDatabase,
    search(options: Partial<SearchOptions> = {}): ReturnType<typeof searchReadingMemoryEvidence> {
      return searchReadingMemoryEvidence({
        query: 'reading memory',
        scope: library,
        signal: new AbortController().signal,
        withDatabase: fixture.withDatabase,
        selectModel: () => fixture.currentInstallation,
        readSemanticStatus(executor, scope) {
          return semanticStatus(executor, scope, fixture.currentInstallation);
        },
        embedQuery: async () => {
          expect(leased).toBe(false);
          return embedding();
        },
        ...options,
      });
    },
  };
  return fixture;
}

function semanticStatus(
  executor: ReadingMemorySqliteExecutor,
  scope: ReadingEvidenceScope,
  current: ReadingMemoryModelInstallation | null,
): ReadingMemorySemanticStatus {
  const coverage = readReadingMemoryVectorCoverage(executor, { ...model, scope });
  return {
    state: !current
      ? 'not_installed'
      : coverage.indexedEntryCount === coverage.eligibleEntryCount
        ? 'available'
        : 'building',
    modelVersion: model.modelVersion,
    queryModelVersion: current?.internalId ?? null,
    coverage,
    indexingPaused: false,
  };
}

function anchor(exact: string) {
  return JSON.stringify({ exact, prefix: '', suffix: '', start: 0, end: exact.length });
}

function embedding(): ReadingMemoryEmbeddingResult {
  const vectors = new Float32Array(model.dimension);
  vectors[0] = 1;
  return { ...model, vectors };
}

function vectorBytes(score: number) {
  const bytes = Buffer.alloc(model.dimension * Float32Array.BYTES_PER_ELEMENT);
  bytes.writeFloatLE(score, 0);
  bytes.writeFloatLE(Math.sqrt(1 - score * score), Float32Array.BYTES_PER_ELEMENT);
  return bytes;
}
