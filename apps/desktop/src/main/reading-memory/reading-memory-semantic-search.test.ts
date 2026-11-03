import { readFileSync } from 'node:fs';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import type { ReadingEvidenceScope, ReadingMemorySemanticStatus } from '@yomitomo/shared';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migrations } from '../db/migrations';
import type {
  ReadingMemoryEmbeddingResult,
  ReadingMemoryModelInstallation,
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
import { readReadingMemoryVectorCoverage } from './reading-memory-vector-store';

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

  it.each(['equal', 'ascending', 'mixed'] as const)(
    'preserves ranked results across chunks with %s scores',
    async (distribution) => {
      const fixture = createFixture();
      const rows = Array.from({ length: 300 }, (_, index) => ({
        id: `item_${String(index).padStart(5, '0')}`,
        score:
          distribution === 'equal'
            ? 0.5
            : distribution === 'ascending'
              ? index / 299
              : ((index * 17) % 31) / 31,
      }));
      fixture.database.transaction(() => {
        for (const row of rows) fixture.add(row.id, 'Stored evidence', true, row.score);
      })();

      const result = await fixture.search({ limit: 24 });
      const expected = rows
        .toSorted((left, right) => right.score - left.score)
        .slice(0, 24)
        .map((row) => row.id);

      expect(result.mode).toBe('hybrid');
      expect(result.evidence.map((item) => item.location.annotationId)).toEqual(expected);
    },
  );
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
    leased = true;
    try {
      return operation(database, fixture.generation);
    } finally {
      leased = false;
    }
  };
  const fixture = {
    database,
    generation: 0,
    currentInstallation: installation as ReadingMemoryModelInstallation | null,
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
