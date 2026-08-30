import { projectReadingEvidenceThread } from '@yomitomo/core';
import {
  deleteOrphanedReadingEvidenceReceipts,
  deleteReadingEvidenceThreadInTransaction,
  readReadingEvidenceBackfillTargetIds,
  replaceReadingEvidenceThreadInTransaction,
} from './reading-memory-evidence-store';
import {
  readStoredAnnotationThreadSources,
  type ReadingMemoryEvidenceSource,
} from './reading-memory-evidence-source';
import {
  completeReadingMemoryProjectionJob,
  deferFailedReadingMemoryProjectionJob,
  queueReadingMemoryProjectionJob,
  readDueReadingMemoryProjectionJobs,
  type DueReadingMemoryProjectionJob,
  type ReadingMemoryProjectionJob,
} from './reading-memory-projection-job-store';
import { deletedAnnotationThreadSourceVersion } from './reading-memory-source-version';
import { withReadingMemoryTransaction } from './reading-memory-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

export const readingMemoryEvidenceProjectorVersion = 'reading-memory-evidence:v2';

const defaultJobLimit = 20;
const defaultBackfillLimit = 50;
const defaultOrphanLimit = 50;
const retryBaseDelayMs = 5_000;
const retryMaximumDelayMs = 5 * 60_000;

export type ReadingMemoryEvidenceProjectionFailure = {
  job: DueReadingMemoryProjectionJob;
  error: unknown;
  retryAt: string;
};

export type ReadingMemoryEvidenceProjectionBatchResult = {
  selectedJobCount: number;
  completedJobCount: number;
  refreshedJobCount: number;
  queuedBackfillCount: number;
  deletedOrphanCount: number;
  failures: ReadingMemoryEvidenceProjectionFailure[];
  hasImmediateWork: boolean;
};

export type ReadingMemoryEvidenceProjectionBatchOptions = {
  now?: Date;
  projectorVersion?: string;
  jobLimit?: number;
  backfillLimit?: number;
  orphanLimit?: number;
};

export function runReadingMemoryEvidenceProjectionBatch(
  executor: ReadingMemorySqliteExecutor,
  options: ReadingMemoryEvidenceProjectionBatchOptions = {},
): ReadingMemoryEvidenceProjectionBatchResult {
  const now = options.now || new Date();
  const nowIso = now.toISOString();
  const projectorVersion = options.projectorVersion || readingMemoryEvidenceProjectorVersion;
  const jobLimit = positiveLimit(options.jobLimit, defaultJobLimit);
  const backfillLimit = positiveLimit(options.backfillLimit, defaultBackfillLimit);
  const orphanLimit = positiveLimit(options.orphanLimit, defaultOrphanLimit);

  const deletedOrphanCount = withReadingMemoryTransaction(executor, () =>
    deleteOrphanedReadingEvidenceReceipts(executor, orphanLimit),
  );
  const backfillTargetIds = readReadingEvidenceBackfillTargetIds(
    executor,
    projectorVersion,
    backfillLimit,
  );
  const backfillSources = readStoredAnnotationThreadSources(executor, backfillTargetIds);
  withReadingMemoryTransaction(executor, () => {
    for (const source of backfillSources) {
      queueReadingMemoryProjectionJob(executor, currentUpsertJob(source, nowIso));
    }
  });

  const jobs = readDueReadingMemoryProjectionJobs(executor, nowIso, jobLimit);
  const sources = readStoredAnnotationThreadSources(
    executor,
    jobs.map((job) => job.targetId),
  );
  const sourcesByTargetId = new Map(sources.map((source) => [source.targetId, source]));
  const failures: ReadingMemoryEvidenceProjectionFailure[] = [];
  let completedJobCount = 0;
  let refreshedJobCount = 0;

  for (const job of jobs) {
    try {
      const outcome = withReadingMemoryTransaction(executor, () =>
        processProjectionJob(
          executor,
          job,
          sourcesByTargetId.get(job.targetId),
          projectorVersion,
          nowIso,
        ),
      );
      if (outcome === 'completed') completedJobCount += 1;
      else refreshedJobCount += 1;
    } catch (error) {
      const retryAt = retryDate(now, job.attemptCount).toISOString();
      try {
        deferFailedReadingMemoryProjectionJob(executor, job, {
          availableAt: retryAt,
          failedAt: nowIso,
        });
        failures.push({ job, error, retryAt });
      } catch (deferError) {
        failures.push({
          job,
          error: new AggregateError([error, deferError], 'READING_MEMORY_PROJECTION_DEFER_FAILED'),
          retryAt,
        });
      }
    }
  }

  return {
    selectedJobCount: jobs.length,
    completedJobCount,
    refreshedJobCount,
    queuedBackfillCount: backfillSources.length,
    deletedOrphanCount,
    failures,
    hasImmediateWork:
      refreshedJobCount > 0 ||
      jobs.length === jobLimit ||
      backfillTargetIds.length === backfillLimit ||
      deletedOrphanCount === orphanLimit,
  };
}

function processProjectionJob(
  executor: ReadingMemorySqliteExecutor,
  job: DueReadingMemoryProjectionJob,
  source: ReadingMemoryEvidenceSource | undefined,
  projectorVersion: string,
  now: string,
): 'completed' | 'refreshed' {
  if (!source) {
    if (job.operation === 'upsert') {
      queueReadingMemoryProjectionJob(executor, {
        targetType: 'annotation_thread',
        targetId: job.targetId,
        articleId: job.articleId,
        sourceVersion: deletedAnnotationThreadSourceVersion(job.targetId),
        operation: 'delete',
        queuedAt: now,
      });
      return 'refreshed';
    }
    deleteReadingEvidenceThreadInTransaction(executor, job.targetId);
    completeReadingMemoryProjectionJob(executor, job);
    return 'completed';
  }

  const currentJob = currentUpsertJob(source, now);
  if (!sameProjectionIntent(job, currentJob)) {
    queueReadingMemoryProjectionJob(executor, currentJob);
    return 'refreshed';
  }

  replaceReadingEvidenceThreadInTransaction(
    executor,
    {
      targetId: source.targetId,
      articleId: source.articleId,
      sourceVersion: source.sourceVersion,
      projectorVersion,
      projectedAt: now,
    },
    projectReadingEvidenceThread({
      articleId: source.articleId,
      annotation: source.annotation,
      sourceVersion: source.sourceVersion,
      projectorVersion,
      reviews: source.reviews,
    }),
  );
  completeReadingMemoryProjectionJob(executor, job);
  return 'completed';
}

function currentUpsertJob(
  source: ReadingMemoryEvidenceSource,
  queuedAt: string,
): ReadingMemoryProjectionJob {
  return {
    targetType: 'annotation_thread',
    targetId: source.targetId,
    articleId: source.articleId,
    sourceVersion: source.sourceVersion,
    operation: 'upsert',
    queuedAt,
  };
}

function sameProjectionIntent(
  job: DueReadingMemoryProjectionJob,
  current: ReadingMemoryProjectionJob,
) {
  return (
    job.operation === current.operation &&
    job.articleId === current.articleId &&
    job.sourceVersion === current.sourceVersion
  );
}

function retryDate(now: Date, attemptCount: number) {
  const exponent = Math.min(Math.max(0, attemptCount), 16);
  const delay = Math.min(retryBaseDelayMs * 2 ** exponent, retryMaximumDelayMs);
  return new Date(now.getTime() + delay);
}

function positiveLimit(value: number | undefined, fallback: number) {
  return value === undefined
    ? fallback
    : Number.isSafeInteger(value) && value > 0
      ? value
      : fallback;
}
