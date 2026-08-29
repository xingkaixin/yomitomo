import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

export type ReadingMemoryProjectionJob = {
  targetType: 'annotation_thread';
  targetId: string;
  articleId: string;
  sourceVersion: string;
  operation: 'upsert' | 'delete';
  queuedAt: string;
};

export function queueReadingMemoryProjectionJob(
  executor: ReadingMemorySqliteExecutor,
  job: ReadingMemoryProjectionJob,
) {
  executor
    .prepare(
      `
INSERT INTO reading_memory_projection_jobs (
  target_type,
  target_id,
  article_id,
  source_version,
  operation,
  queued_at
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(target_type, target_id) DO UPDATE SET
  article_id = excluded.article_id,
  source_version = excluded.source_version,
  operation = excluded.operation,
  queued_at = excluded.queued_at
WHERE reading_memory_projection_jobs.article_id <> excluded.article_id
  OR reading_memory_projection_jobs.source_version <> excluded.source_version
  OR reading_memory_projection_jobs.operation <> excluded.operation
`,
    )
    .run(
      job.targetType,
      job.targetId,
      job.articleId,
      job.sourceVersion,
      job.operation,
      job.queuedAt,
    );
}

export function readReadingMemoryProjectionJobs(
  executor: ReadingMemorySqliteExecutor,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];

  return executor
    .prepare(
      `
SELECT
  target_type AS targetType,
  target_id AS targetId,
  article_id AS articleId,
  source_version AS sourceVersion,
  operation,
  queued_at AS queuedAt
FROM reading_memory_projection_jobs
ORDER BY queued_at ASC, target_type ASC, target_id ASC
LIMIT ?
`,
    )
    .all(limit) as ReadingMemoryProjectionJob[];
}

export function completeReadingMemoryProjectionJob(
  executor: ReadingMemorySqliteExecutor,
  job: Pick<ReadingMemoryProjectionJob, 'targetType' | 'targetId' | 'sourceVersion'>,
) {
  executor
    .prepare(
      `
DELETE FROM reading_memory_projection_jobs
WHERE target_type = ?
  AND target_id = ?
  AND source_version = ?
`,
    )
    .run(job.targetType, job.targetId, job.sourceVersion);
}
