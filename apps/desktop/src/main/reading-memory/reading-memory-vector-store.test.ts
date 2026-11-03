import type { ReadingEvidenceScope } from '@yomitomo/shared';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import {
  activateReadingMemoryModelVersion,
  deleteReadingMemoryModelVectors,
  readActiveReadingMemoryModelVersion,
  readMissingReadingMemoryVectors,
  readReadingMemoryVectorChunk,
  readReadingMemoryVectorCoverage,
  writeReadingMemoryVectors,
  type ReadingMemoryEmbeddingEntry,
} from './reading-memory-vector-store';

const timestamp = '2026-08-30T00:00:00.000Z';
const model = { modelVersion: 'model:v1', dimension: 2 };
const nextModel = { modelVersion: 'model:v2', dimension: 2 };
const library: ReadingEvidenceScope = { kind: 'library' };
const databases: SQLiteDatabase.Database[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe('reading memory vector storage', () => {
  it('round-trips little-endian float vectors and keeps model versions independent', () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.project('a');
    const entries = fixture.missing();
    const input = new Float32Array([9, 0.6, 0.8, 9]);
    expect(
      writeReadingMemoryVectors(fixture.database, {
        ...model,
        entries,
        vectors: input.subarray(1, 3),
      }),
    ).toBe(1);
    expect(fixture.write(entries, nextModel)).toBe(1);
    expect(fixture.missing()).toEqual([]);
    expect(fixture.missing(nextModel)).toEqual([]);
    const [result] = fixture.read();
    expect(Array.from(result.vector)).toEqual(Array.from(input.subarray(1, 3)));
    result.vector.fill(0);
    expect(Array.from(fixture.read()[0].vector)).toEqual(Array.from(input.subarray(1, 3)));
    expect(fixture.write(entries)).toBe(1);
    expect(
      fixture.database
        .prepare('SELECT count(*) AS count FROM reading_memory_evidence_vectors')
        .get(),
    ).toEqual({ count: 2 });
    const row = fixture.database
      .prepare(
        'SELECT hex(vector) AS bytes FROM reading_memory_evidence_vectors WHERE model_version = ?',
      )
      .get(model.modelVersion);
    expect(row).toEqual({ bytes: '0000803F00000000' });
  });
  it('switches only after complete projection and vector coverage and leaves old vectors until cleanup', () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.project('a');
    fixture.write(fixture.missing());
    expect(activateReadingMemoryModelVersion(fixture.database, model)).toBe(true);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(model.modelVersion);

    fixture.add('b');
    fixture.write(fixture.missing(nextModel), nextModel);
    expect(activateReadingMemoryModelVersion(fixture.database, nextModel)).toBe(false);
    fixture.project('b');
    expect(fixture.coverage(nextModel)).toEqual({ indexedEntryCount: 1, eligibleEntryCount: 2 });
    expect(activateReadingMemoryModelVersion(fixture.database, nextModel)).toBe(false);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(model.modelVersion);
    fixture.write(fixture.missing(nextModel), nextModel);
    expect(activateReadingMemoryModelVersion(fixture.database, nextModel)).toBe(true);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(nextModel.modelVersion);
    expect(fixture.read(model)).toHaveLength(1);

    deleteReadingMemoryModelVectors(fixture.database, model.modelVersion);
    expect(fixture.read(model)).toEqual([]);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(nextModel.modelVersion);
    deleteReadingMemoryModelVectors(fixture.database, nextModel.modelVersion);
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBeNull();
    expect(fixture.missing(nextModel)).toHaveLength(2);
  });
});

function createFixture() {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) database.exec(migration.sql);
  function source(id: string) {
    const [result] = readStoredAnnotationThreadSources(database, [id]);
    if (!result) throw new Error(`Missing source ${id}`);
    return result;
  }
  return {
    database,
    add(id: string, createdAt = timestamp) {
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
          createdAt,
          createdAt,
        );
      database
        .prepare(`
INSERT INTO annotations (id, article_id, anchor, author, color, created_at, updated_at)
VALUES (?, ?, ?, 'user', '#000000', ?, ?)
`)
        .run(
          id,
          `article_${id}`,
          JSON.stringify({ exact: `Evidence ${id}`, prefix: '', suffix: '', start: 0, end: 10 }),
          createdAt,
          createdAt,
        );
    },
    project(id: string, projectorVersion = readingMemoryEvidenceProjectorVersion) {
      const current = source(id);
      database.transaction(() =>
        replaceReadingEvidenceThreadInTransaction(
          database,
          {
            targetId: id,
            articleId: current.articleId,
            sourceVersion: current.sourceVersion,
            projectorVersion,
            projectedAt: timestamp,
          },
          projectReadingEvidenceThread({
            articleId: current.articleId,
            annotation: current.annotation,
            sourceVersion: current.sourceVersion,
            projectorVersion,
          }),
        ),
      )();
      return current;
    },
    missing(selectedModel = model) {
      return readMissingReadingMemoryVectors(database, { ...selectedModel, limit: 100 });
    },
    write(entries: ReadingMemoryEmbeddingEntry[], selectedModel = model) {
      const vectors = new Float32Array(entries.length * selectedModel.dimension);
      for (let index = 0; index < entries.length; index += 1)
        vectors[index * selectedModel.dimension] = 1;
      return writeReadingMemoryVectors(database, { ...selectedModel, entries, vectors });
    },
    read(selectedModel = model, scope = library, limit = 100, afterId?: string) {
      return readReadingMemoryVectorChunk(database, { ...selectedModel, scope, limit, afterId });
    },
    coverage(selectedModel = model, scope = library) {
      return readReadingMemoryVectorCoverage(database, { ...selectedModel, scope });
    },
  };
}
