import type { ProjectedReadingEvidenceEntry } from '@yomitomo/core';
import { recordField, stringField } from '@yomitomo/shared';
import { withReadingMemoryTransaction } from './reading-memory-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const annotationThreadTargetType = 'annotation_thread';

type ReadingMemoryEvidenceReceipt = {
  targetId: string;
  articleId: string;
  sourceVersion: string;
  projectorVersion: string;
  projectedAt: string;
};

export function resetReadingEvidenceProjection(executor: ReadingMemorySqliteExecutor) {
  withReadingMemoryTransaction(executor, () => {
    executor.exec(`
DELETE FROM reading_memory_evidence_fts;
DELETE FROM reading_memory_evidence_vectors;
DELETE FROM reading_memory_evidence_entries;
DELETE FROM reading_memory_evidence_receipts;
DELETE FROM reading_memory_projection_jobs;
DELETE FROM reading_memory_semantic_state;
`);
  });
}

export function replaceReadingEvidenceThreadInTransaction(
  executor: ReadingMemorySqliteExecutor,
  receipt: ReadingMemoryEvidenceReceipt,
  entries: readonly ProjectedReadingEvidenceEntry[],
) {
  executor
    .prepare(
      `
INSERT INTO reading_memory_evidence_receipts (
  target_type,
  target_id,
  article_id,
  source_version,
  projector_version,
  projected_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(target_type, target_id) DO UPDATE SET
  article_id = excluded.article_id,
  source_version = excluded.source_version,
  projector_version = excluded.projector_version,
  projected_at = excluded.projected_at
`,
    )
    .run(
      annotationThreadTargetType,
      receipt.targetId,
      receipt.articleId,
      receipt.sourceVersion,
      receipt.projectorVersion,
      receipt.projectedAt,
    );
  executor
    .prepare(
      `
DELETE FROM reading_memory_evidence_entries
WHERE target_type = ? AND target_id = ?
`,
    )
    .run(annotationThreadTargetType, receipt.targetId);
  if (entries.length === 0) return;

  const insert = executor.prepare(
    `
INSERT INTO reading_memory_evidence_entries (
  id,
  article_id,
  target_type,
  target_id,
  asset_type,
  source_comment_id,
  source_version,
  projector_version,
  is_judgment,
  is_user_authored,
  search_text,
  source_created_at,
  source_updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`,
  );
  for (const entry of entries) {
    insert.run(
      entry.id,
      receipt.articleId,
      annotationThreadTargetType,
      receipt.targetId,
      entry.assetType,
      entry.sourceCommentId || null,
      entry.sourceVersion,
      entry.projectorVersion,
      entry.isJudgment ? 1 : 0,
      entry.isUserAuthored ? 1 : 0,
      entry.searchText,
      entry.sourceCreatedAt,
      entry.sourceUpdatedAt,
    );
  }
}

export function deleteReadingEvidenceThreadInTransaction(
  executor: ReadingMemorySqliteExecutor,
  targetId: string,
) {
  executor
    .prepare(
      `
DELETE FROM reading_memory_evidence_receipts
WHERE target_type = ? AND target_id = ?
`,
    )
    .run(annotationThreadTargetType, targetId);
}

export function readReadingEvidenceBackfillTargetIds(
  executor: ReadingMemorySqliteExecutor,
  projectorVersion: string,
  limit: number,
) {
  if (!validLimit(limit)) return [];
  return executor
    .prepare(
      `
SELECT annotation.id
FROM annotations AS annotation
LEFT JOIN reading_memory_evidence_receipts AS receipt
  ON receipt.target_type = ?
  AND receipt.target_id = annotation.id
LEFT JOIN reading_memory_projection_jobs AS job
  ON job.target_type = ?
  AND job.target_id = annotation.id
WHERE (receipt.target_id IS NULL OR receipt.projector_version <> ?)
  AND job.target_id IS NULL
ORDER BY annotation.article_id ASC, annotation.id ASC
LIMIT ?
`,
    )
    .all(annotationThreadTargetType, annotationThreadTargetType, projectorVersion, limit)
    .map((row) => stringField(recordField(row, 'id')))
    .filter(Boolean);
}

export function deleteOrphanedReadingEvidenceReceipts(
  executor: ReadingMemorySqliteExecutor,
  limit: number,
) {
  if (!validLimit(limit)) return 0;
  const targetIds = executor
    .prepare(
      `
SELECT receipt.target_id AS targetId
FROM reading_memory_evidence_receipts AS receipt
LEFT JOIN annotations AS annotation
  ON annotation.id = receipt.target_id
WHERE receipt.target_type = ?
  AND annotation.id IS NULL
ORDER BY receipt.target_id ASC
LIMIT ?
`,
    )
    .all(annotationThreadTargetType, limit)
    .map((row) => stringField(recordField(row, 'targetId')))
    .filter(Boolean);
  if (targetIds.length === 0) return 0;

  executor
    .prepare(
      `
DELETE FROM reading_memory_evidence_receipts
WHERE target_type = ?
  AND target_id IN (${questionMarks(targetIds.length)})
`,
    )
    .run(annotationThreadTargetType, ...targetIds);
  return targetIds.length;
}

function validLimit(limit: number) {
  return Number.isSafeInteger(limit) && limit > 0;
}

function questionMarks(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}
