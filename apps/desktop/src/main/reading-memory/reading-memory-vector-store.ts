import type { ReadingEvidenceScope } from '@yomitomo/shared';
import { finiteNumberFieldOrZero, recordField, stringField } from '@yomitomo/shared';
import { readingMemoryEvidenceProjectorVersion } from './reading-memory-evidence-projection-batch';
import {
  readReadingEvidenceProjectionStatus,
  scopeArticleFilter,
  type ReadingEvidenceCandidate,
} from './reading-memory-evidence-search';
import { readStoredAnnotationThreadSources } from './reading-memory-evidence-source';
import { withReadingMemoryTransaction } from './reading-memory-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

export type ReadingMemoryEmbeddingEntry = ReadingEvidenceCandidate & {
  projectorVersion: string;
  searchText: string;
};

type VectorModel = {
  modelVersion: string;
  dimension: number;
};

type ScopedVectorModel = VectorModel & { scope: ReadingEvidenceScope };

const currentEntryTables = `
FROM reading_memory_evidence_entries AS entry
INNER JOIN annotations AS annotation
  ON annotation.id = entry.target_id AND annotation.article_id = entry.article_id
INNER JOIN reading_memory_evidence_receipts AS receipt
  ON receipt.target_type = entry.target_type
  AND receipt.target_id = entry.target_id
  AND receipt.article_id = entry.article_id
  AND receipt.source_version = entry.source_version
  AND receipt.projector_version = entry.projector_version
LEFT JOIN reading_memory_projection_jobs AS job
  ON job.target_type = entry.target_type AND job.target_id = entry.target_id
`;

const currentEntryCondition = `
entry.projector_version = ?
AND (
  job.target_id IS NULL
  OR (
    job.operation = 'upsert'
    AND job.article_id = entry.article_id
    AND job.source_version = entry.source_version
  )
)
`;

const matchingVectorCondition = `
stored.evidence_id = entry.id
AND stored.model_version = ?
AND stored.dimension = ?
AND stored.source_version = entry.source_version
AND stored.projector_version = entry.projector_version
AND typeof(stored.vector) = 'blob'
AND length(stored.vector) = stored.dimension * 4
`;

const candidateColumns = `
entry.id,
entry.article_id AS articleId,
entry.target_id AS targetId,
entry.source_version AS sourceVersion
`;

export function readMissingReadingMemoryVectors(
  executor: ReadingMemorySqliteExecutor,
  options: VectorModel & { limit: number },
): ReadingMemoryEmbeddingEntry[] {
  assertVectorModel(options);
  if (!validLimit(options.limit)) return [];
  return executor
    .prepare(
      `
SELECT ${candidateColumns},
  entry.projector_version AS projectorVersion,
  entry.search_text AS searchText
${currentEntryTables}
LEFT JOIN reading_memory_evidence_vectors AS stored ON ${matchingVectorCondition}
WHERE ${currentEntryCondition}
  AND stored.evidence_id IS NULL
ORDER BY entry.id ASC
LIMIT ?
`,
    )
    .all(
      options.modelVersion,
      options.dimension,
      readingMemoryEvidenceProjectorVersion,
      options.limit,
    )
    .map((row) =>
      Object.assign(candidateFromRow(row), {
        projectorVersion: stringField(recordField(row, 'projectorVersion')),
        searchText: stringField(recordField(row, 'searchText')),
      }),
    );
}

export function writeReadingMemoryVectors(
  executor: ReadingMemorySqliteExecutor,
  options: VectorModel & {
    entries: readonly ReadingMemoryEmbeddingEntry[];
    vectors: Float32Array;
  },
): number {
  assertVectorModel(options);
  const valueCount = options.entries.length * options.dimension;
  if (
    !Number.isSafeInteger(valueCount) ||
    options.vectors.length !== valueCount ||
    options.vectors.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Invalid reading memory vector data');
  }
  if (options.entries.length === 0) return 0;

  return withReadingMemoryTransaction(executor, () => {
    const sources = new Map(
      readStoredAnnotationThreadSources(
        executor,
        options.entries.map((entry) => entry.targetId),
      ).map((source) => [source.targetId, source]),
    );
    const insert = executor.prepare(`
INSERT INTO reading_memory_evidence_vectors (
  evidence_id, model_version, source_version, projector_version, dimension, vector
)
SELECT entry.id, ?, entry.source_version, entry.projector_version, ?, ?
${currentEntryTables}
WHERE ${currentEntryCondition}
  AND entry.id = ?
  AND entry.article_id = ?
  AND entry.target_id = ?
  AND entry.source_version = ?
  AND entry.projector_version = ?
  AND entry.search_text = ?
ON CONFLICT(evidence_id, model_version) DO UPDATE SET
  source_version = excluded.source_version,
  projector_version = excluded.projector_version,
  dimension = excluded.dimension,
  vector = excluded.vector
`);
    const changes = executor.prepare('SELECT changes() AS count');
    let written = 0;
    for (const [index, entry] of options.entries.entries()) {
      const source = sources.get(entry.targetId);
      if (source?.sourceVersion !== entry.sourceVersion || source.articleId !== entry.articleId) {
        continue;
      }
      const vector = options.vectors.subarray(
        index * options.dimension,
        (index + 1) * options.dimension,
      );
      insert.run(
        options.modelVersion,
        options.dimension,
        vectorBytes(vector),
        readingMemoryEvidenceProjectorVersion,
        entry.id,
        entry.articleId,
        entry.targetId,
        entry.sourceVersion,
        entry.projectorVersion,
        entry.searchText,
      );
      written += finiteNumberFieldOrZero(recordField(changes.get(), 'count'));
    }
    return written;
  });
}

export function readReadingMemoryVectorCoverage(
  executor: ReadingMemorySqliteExecutor,
  options: ScopedVectorModel,
): { indexedEntryCount: number; eligibleEntryCount: number } {
  assertVectorModel(options);
  const scope = scopeArticleFilter(options.scope, 'entry');
  const row = executor
    .prepare(
      `
SELECT count(*) AS eligibleEntryCount, count(stored.evidence_id) AS indexedEntryCount
${currentEntryTables}
LEFT JOIN reading_memory_evidence_vectors AS stored ON ${matchingVectorCondition}
WHERE ${currentEntryCondition} AND (${scope.sql})
`,
    )
    .get(
      options.modelVersion,
      options.dimension,
      readingMemoryEvidenceProjectorVersion,
      ...scope.values,
    );
  return {
    indexedEntryCount: finiteNumberFieldOrZero(recordField(row, 'indexedEntryCount')),
    eligibleEntryCount: finiteNumberFieldOrZero(recordField(row, 'eligibleEntryCount')),
  };
}

export function readActiveReadingMemoryModelVersion(
  executor: ReadingMemorySqliteExecutor,
): string | null {
  const row = executor
    .prepare(
      'SELECT active_model_version AS modelVersion FROM reading_memory_semantic_state WHERE id = 1',
    )
    .get();
  return stringField(recordField(row, 'modelVersion')) || null;
}

export function activateReadingMemoryModelVersion(
  executor: ReadingMemorySqliteExecutor,
  options: VectorModel,
): boolean {
  assertVectorModel(options);
  return withReadingMemoryTransaction(executor, () => {
    const scope: ReadingEvidenceScope = { kind: 'library' };
    const projection = readReadingEvidenceProjectionStatus({ executor, scope });
    if (projection.state !== 'available') return false;
    const coverage = readReadingMemoryVectorCoverage(executor, { ...options, scope });
    if (coverage.indexedEntryCount !== coverage.eligibleEntryCount) return false;
    executor
      .prepare(
        `
INSERT INTO reading_memory_semantic_state (id, active_model_version) VALUES (1, ?)
ON CONFLICT(id) DO UPDATE SET active_model_version = excluded.active_model_version
`,
      )
      .run(options.modelVersion);
    return true;
  });
}

export function deleteReadingMemoryModelVectors(
  executor: ReadingMemorySqliteExecutor,
  modelVersion: string,
): void {
  withReadingMemoryTransaction(executor, () => {
    executor
      .prepare('DELETE FROM reading_memory_evidence_vectors WHERE model_version = ?')
      .run(modelVersion);
    executor
      .prepare('DELETE FROM reading_memory_semantic_state WHERE active_model_version = ?')
      .run(modelVersion);
  });
}

export function readReadingMemoryVectorChunk(
  executor: ReadingMemorySqliteExecutor,
  options: ScopedVectorModel & { afterId?: string; limit: number },
): (ReadingEvidenceCandidate & { vector: Float32Array })[] {
  assertVectorModel(options);
  if (!validLimit(options.limit)) return [];
  const scope = scopeArticleFilter(options.scope, 'entry');
  return executor
    .prepare(
      `
SELECT ${candidateColumns}, stored.vector
${currentEntryTables}
INNER JOIN reading_memory_evidence_vectors AS stored ON ${matchingVectorCondition}
WHERE ${currentEntryCondition}
  AND (${scope.sql}) AND stored.evidence_id > ?
ORDER BY stored.evidence_id ASC
LIMIT ?
`,
    )
    .all(
      options.modelVersion,
      options.dimension,
      readingMemoryEvidenceProjectorVersion,
      ...scope.values,
      options.afterId || '',
      options.limit,
    )
    .map((row) =>
      Object.assign(candidateFromRow(row), {
        vector: vectorFromBytes(recordField(row, 'vector')),
      }),
    );
}

function candidateFromRow(row: unknown): ReadingEvidenceCandidate {
  return {
    id: stringField(recordField(row, 'id')),
    articleId: stringField(recordField(row, 'articleId')),
    targetId: stringField(recordField(row, 'targetId')),
    sourceVersion: stringField(recordField(row, 'sourceVersion')),
  };
}

function vectorBytes(vector: Float32Array): Uint8Array {
  const bytes = new Uint8Array(vector.byteLength);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < vector.length; index += 1) {
    view.setFloat32(index * Float32Array.BYTES_PER_ELEMENT, vector[index], true);
  }
  return bytes;
}

function vectorFromBytes(bytes: unknown): Float32Array {
  if (!(bytes instanceof Uint8Array)) throw new Error('Invalid reading memory vector bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const vector = new Float32Array(bytes.byteLength / Float32Array.BYTES_PER_ELEMENT);
  for (let index = 0; index < vector.length; index += 1) {
    vector[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
  }
  return vector;
}

function assertVectorModel(options: VectorModel) {
  if (
    !options.modelVersion ||
    !Number.isInteger(options.dimension) ||
    options.dimension < 1 ||
    options.dimension > 2_147_483_647
  ) {
    throw new Error('Invalid reading memory vector model');
  }
}

function validLimit(limit: number) {
  return Number.isSafeInteger(limit) && limit > 0;
}
