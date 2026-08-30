import type { ReadingEvidenceScope } from '@yomitomo/shared';
import { projectReadingEvidenceThread } from '@yomitomo/core';
import SQLiteDatabase from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { migrations } from '../db/migrations';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { replaceReadingEvidenceThreadInTransaction } from './reading-memory-evidence-store';
import { queueReadingMemoryProjectionJob } from './reading-memory-projection-job-store';
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
  it('adds constrained vectors without changing existing evidence', () => {
    const fixture = createFixture(false);
    fixture.add('a');
    const source = fixture.project('a');
    const migration = migrations.find((item) => item.id === '0069_reading_memory_vectors');
    if (!migration) throw new Error('Missing vector migration');
    fixture.database.exec(migration.sql);
    expect(fixture.missing()).toHaveLength(1);

    const insert = fixture.database.prepare(`
INSERT INTO reading_memory_evidence_vectors (
  evidence_id, model_version, source_version, projector_version, dimension, vector
) VALUES (?, ?, ?, ?, ?, ?)
`);
    const values = [
      'reading_evidence_annotation:a',
      model.modelVersion,
      source.sourceVersion,
      readingMemoryEvidenceProjectorVersion,
    ];
    for (const [dimension, vector] of [
      [0, Buffer.alloc(0)],
      [-1, Buffer.alloc(0)],
      [1.5, Buffer.alloc(6)],
      [2, Buffer.alloc(4)],
      [2, '12345678'],
    ]) {
      expect(() => insert.run(...values, dimension, vector)).toThrow(/CHECK constraint failed/);
    }
    insert.run(...values, 2, Buffer.alloc(8));
    expect(() => insert.run(...values, 2, Buffer.alloc(8))).toThrow(/UNIQUE constraint failed/);
    expect(() =>
      insert.run('missing', 'model:v1', 'source', 'projector', 2, Buffer.alloc(8)),
    ).toThrow(/FOREIGN KEY constraint failed/);
    expect(() =>
      fixture.database
        .prepare(
          'INSERT INTO reading_memory_semantic_state (id, active_model_version) VALUES (2, ?)',
        )
        .run('model:v1'),
    ).toThrow(/CHECK constraint failed/);

    fixture.database.prepare('DELETE FROM reading_memory_evidence_receipts').run();
    expect(
      fixture.database
        .prepare('SELECT count(*) AS count FROM reading_memory_evidence_vectors')
        .get(),
    ).toEqual({ count: 0 });
  });

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

  it('filters scope, stale rows, and invalid shapes before keyset limits', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'c', 'd']) {
      fixture.add(id);
      fixture.project(id);
    }
    fixture.write(fixture.missing());
    fixture.database.exec('PRAGMA ignore_check_constraints = ON');
    fixture.database
      .prepare('UPDATE reading_memory_evidence_vectors SET vector = ? WHERE evidence_id = ?')
      .run(Buffer.alloc(4), 'reading_evidence_annotation:a');
    fixture.database.exec('PRAGMA ignore_check_constraints = OFF');
    fixture.queue('b', 'delete');
    const first = fixture.read(model, library, 1);
    expect(first.map((row) => row.targetId)).toEqual(['c']);
    expect(fixture.read(model, library, 1, first[0].id).map((row) => row.targetId)).toEqual(['d']);
    expect(fixture.missing().map((entry) => entry.targetId)).toEqual(['a']);
    expect(fixture.coverage()).toEqual({ indexedEntryCount: 2, eligibleEntryCount: 3 });

    const selected: ReadingEvidenceScope = {
      kind: 'sources',
      sources: [{ kind: 'article', id: 'article_d' }],
    };
    expect(fixture.read(model, selected, 1).map((row) => row.targetId)).toEqual(['d']);
    expect(fixture.coverage(model, selected)).toEqual({
      indexedEntryCount: 1,
      eligibleEntryCount: 1,
    });
    expect(
      fixture.read(model, { kind: 'sources', sources: [{ kind: 'weread', id: 'article_d' }] }),
    ).toEqual([]);
    fixture.database
      .prepare('INSERT INTO collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('selected', 'Selected', timestamp, timestamp);
    fixture.database
      .prepare(
        "INSERT INTO collection_members (collection_id, member_kind, member_id, added_at) VALUES (?, 'article', ?, ?)",
      )
      .run('selected', 'article_d', timestamp);
    expect(
      fixture
        .read(model, { kind: 'collection', collectionId: 'selected' }, 1)
        .map((row) => row.targetId),
    ).toEqual(['d']);
  });

  it('immediately rejects changed or deleted sources while retaining same-version upsert eligibility', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'c', 'd']) {
      fixture.add(id);
      fixture.project(id);
    }
    fixture.write(fixture.missing());
    fixture.change('a');
    fixture.queue('a');
    fixture.database.prepare('DELETE FROM annotations WHERE id = ?').run('b');
    fixture.queue('c', 'delete');
    fixture.queue('d');
    expect(fixture.read().map((row) => row.targetId)).toEqual(['d']);
    expect(fixture.coverage()).toEqual({ indexedEntryCount: 1, eligibleEntryCount: 1 });
    expect(fixture.missing()).toEqual([]);
  });

  it('rechecks original source versions inside the write transaction and skips only stale rows', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'c']) {
      fixture.add(id);
      fixture.project(id);
    }
    const entries = fixture.missing();
    fixture.change('a');
    fixture.database.prepare('DELETE FROM annotations WHERE id = ?').run('b');
    expect(fixture.write(entries)).toBe(1);
    expect(fixture.read().map((row) => row.targetId)).toEqual(['c']);
    fixture.queue('a');
    fixture.project('a');
    expect(fixture.write(entries)).toBe(1);
    expect(fixture.missing().map((entry) => entry.targetId)).toEqual(['a']);
    expect(fixture.write(fixture.missing())).toBe(1);
    expect(fixture.read().map((row) => row.targetId)).toEqual(['a', 'c']);
  });

  it('rejects writes when pending intent or the current projector no longer matches', () => {
    const fixture = createFixture();
    for (const id of ['a', 'b', 'c']) {
      fixture.add(id);
      fixture.project(id);
    }
    const entries = fixture.missing();
    fixture.queue('a', 'delete');
    fixture.project('b', 'old-projector');
    fixture.database
      .prepare('UPDATE reading_memory_evidence_entries SET search_text = ? WHERE target_id = ?')
      .run('changed projection text', 'c');
    expect(fixture.write(entries)).toBe(0);
    expect(fixture.missing().map((entry) => entry.targetId)).toEqual(['c']);
    expect(fixture.coverage()).toEqual({ indexedEntryCount: 0, eligibleEntryCount: 1 });
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

  it('rolls back a failed active-version switch without altering the old version', () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.project('a');
    fixture.write(fixture.missing());
    fixture.write(fixture.missing(nextModel), nextModel);
    activateReadingMemoryModelVersion(fixture.database, model);
    fixture.database.exec(`
CREATE TRIGGER reject_switch BEFORE UPDATE ON reading_memory_semantic_state
BEGIN SELECT RAISE(ABORT, 'switch failed'); END;
`);
    expect(() => activateReadingMemoryModelVersion(fixture.database, nextModel)).toThrow(
      'switch failed',
    );
    expect(readActiveReadingMemoryModelVersion(fixture.database)).toBe(model.modelVersion);
    expect(fixture.read(model)).toHaveLength(1);
    expect(fixture.read(nextModel)).toHaveLength(1);
  });

  it('refills vector gaps after same-source projection replacement cascades both model versions', () => {
    const fixture = createFixture();
    fixture.add('a');
    const before = fixture.project('a');
    fixture.write(fixture.missing());
    fixture.write(fixture.missing(nextModel), nextModel);
    const after = fixture.project('a');
    expect(after.sourceVersion).toBe(before.sourceVersion);
    expect(fixture.coverage()).toEqual({ indexedEntryCount: 0, eligibleEntryCount: 1 });
    expect(fixture.coverage(nextModel)).toEqual({ indexedEntryCount: 0, eligibleEntryCount: 1 });
    expect(fixture.missing()).toHaveLength(1);
    fixture.write(fixture.missing());
    expect(fixture.coverage()).toEqual({ indexedEntryCount: 1, eligibleEntryCount: 1 });
    expect(fixture.missing(nextModel)).toHaveLength(1);
  });

  it('rejects invalid input shapes and ignores unusable scan limits', () => {
    const fixture = createFixture();
    fixture.add('a');
    fixture.project('a');
    const entries = fixture.missing();
    for (const vectors of [
      new Float32Array(1),
      new Float32Array([NaN, 1]),
      new Float32Array([Infinity, 1]),
    ]) {
      expect(() =>
        writeReadingMemoryVectors(fixture.database, { ...model, entries, vectors }),
      ).toThrow('Invalid reading memory vector data');
    }
    for (const dimension of [0, -1, 0.5, Number.MAX_SAFE_INTEGER]) {
      expect(() =>
        readMissingReadingMemoryVectors(fixture.database, { ...model, dimension, limit: 1 }),
      ).toThrow('Invalid reading memory vector model');
    }
    expect(fixture.read(model, library, 0)).toEqual([]);
    expect(
      readMissingReadingMemoryVectors(fixture.database, { ...model, limit: Infinity }),
    ).toEqual([]);
    expect(fixture.write([])).toBe(0);
  });
});

function createFixture(includeVectorMigration = true) {
  const database = new SQLiteDatabase(':memory:');
  databases.push(database);
  database.pragma('foreign_keys = ON');
  for (const migration of migrations) {
    if (includeVectorMigration || migration.id !== '0069_reading_memory_vectors')
      database.exec(migration.sql);
  }
  function source(id: string) {
    const [result] = readStoredAnnotationThreadSources(database, [id]);
    if (!result) throw new Error(`Missing source ${id}`);
    return result;
  }
  return {
    database,
    add(id: string) {
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
        .run(
          id,
          `article_${id}`,
          JSON.stringify({ exact: `Evidence ${id}`, prefix: '', suffix: '', start: 0, end: 10 }),
          timestamp,
          timestamp,
        );
    },
    change(id: string) {
      database
        .prepare('UPDATE annotations SET anchor = ? WHERE id = ?')
        .run(
          JSON.stringify({ exact: `Changed ${id}`, prefix: '', suffix: '', start: 0, end: 9 }),
          id,
        );
    },
    queue(id: string, operation: 'upsert' | 'delete' = 'upsert') {
      const current = source(id);
      queueReadingMemoryProjectionJob(database, {
        targetType: 'annotation_thread',
        targetId: id,
        articleId: current.articleId,
        sourceVersion: current.sourceVersion,
        operation,
        queuedAt: timestamp,
      });
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
