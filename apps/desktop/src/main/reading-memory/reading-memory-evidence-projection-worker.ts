import { logError, logInfo } from '../app/logger';
import { getSqliteExecutor, withDatabaseLease } from '../store/store-db';
import {
  runReadingMemoryEvidenceProjectionBatch,
  type ReadingMemoryEvidenceProjectionBatchOptions,
  type ReadingMemoryEvidenceProjectionBatchResult,
} from './reading-memory-evidence-projection-batch';

const defaultStartupDelayMs = 2_000;
const defaultIdleDelayMs = 5_000;

export type ReadingMemoryEvidenceProjectionRunReason =
  | 'source_changed'
  | 'database_restored'
  | 'manual';

export type ReadingMemoryEvidenceProjectionWorker = {
  requestRun(reason?: ReadingMemoryEvidenceProjectionRunReason): void;
  dispose(): void;
};

export type ReadingMemoryEvidenceProjectionWorkerOptions = {
  startupDelayMs?: number;
  idleDelayMs?: number;
  batchOptions?: Omit<ReadingMemoryEvidenceProjectionBatchOptions, 'now'>;
};

type InternalRunReason =
  | ReadingMemoryEvidenceProjectionRunReason
  | 'startup'
  | 'continued'
  | 'poll';

export function startReadingMemoryEvidenceProjectionWorker(
  options: ReadingMemoryEvidenceProjectionWorkerOptions = {},
): ReadingMemoryEvidenceProjectionWorker {
  const startupDelayMs = nonNegativeDelay(options.startupDelayMs, defaultStartupDelayMs);
  const idleDelayMs = positiveDelay(options.idleDelayMs, defaultIdleDelayMs);
  let disposed = false;
  let running = false;
  let rerunReason: ReadingMemoryEvidenceProjectionRunReason | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delayMs: number, reason: InternalRunReason) => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run(reason);
    }, delayMs);
    timer.unref?.();
  };

  const run = async (reason: InternalRunReason) => {
    if (disposed || running) return;
    running = true;
    let result: ReadingMemoryEvidenceProjectionBatchResult | undefined;
    try {
      result = await withDatabaseLease(async () =>
        runReadingMemoryEvidenceProjectionBatch(getSqliteExecutor(), {
          ...options.batchOptions,
          now: new Date(),
        }),
      );
      logBatchResult(reason, result);
    } catch (error) {
      if (isDatabaseReplacing(error)) {
        logInfo('reading_memory.evidence_projection_database_wait', { reason });
      } else {
        logError('reading_memory.evidence_projection_batch_failed', error, { reason });
      }
    } finally {
      running = false;
    }

    if (disposed) return;
    if (rerunReason) {
      const requestedReason = rerunReason;
      rerunReason = undefined;
      schedule(0, requestedReason);
    } else if (result?.hasImmediateWork) {
      schedule(0, 'continued');
    } else {
      schedule(idleDelayMs, 'poll');
    }
  };

  schedule(startupDelayMs, 'startup');
  return {
    requestRun: (reason = 'manual') => {
      if (disposed) return;
      if (running) {
        rerunReason = reason;
        return;
      }
      schedule(0, reason);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      rerunReason = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}

function logBatchResult(
  reason: InternalRunReason,
  result: ReadingMemoryEvidenceProjectionBatchResult,
) {
  for (const failure of result.failures) {
    logError('reading_memory.evidence_projection_job_failed', failure.error, {
      reason,
      targetType: failure.job.targetType,
      targetId: failure.job.targetId,
      sourceVersion: failure.job.sourceVersion,
      attemptCount: failure.job.attemptCount + 1,
      retryAt: failure.retryAt,
    });
  }
  if (
    result.selectedJobCount === 0 &&
    result.queuedBackfillCount === 0 &&
    result.deletedOrphanCount === 0
  ) {
    return;
  }
  logInfo('reading_memory.evidence_projection_batch_complete', {
    reason,
    selectedJobCount: result.selectedJobCount,
    completedJobCount: result.completedJobCount,
    refreshedJobCount: result.refreshedJobCount,
    queuedBackfillCount: result.queuedBackfillCount,
    deletedOrphanCount: result.deletedOrphanCount,
    failedJobCount: result.failures.length,
    hasImmediateWork: result.hasImmediateWork,
  });
}

function isDatabaseReplacing(error: unknown) {
  return error instanceof Error && error.message === 'DATA_MANAGEMENT_DATABASE_REPLACING';
}

function nonNegativeDelay(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function positiveDelay(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
