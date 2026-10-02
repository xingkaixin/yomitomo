import { Effect, Exit, Option, Queue, Schedule, Scope } from 'effect';
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
  dispose(): Promise<void>;
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
  const scope = Scope.makeUnsafe();
  const requests = Effect.runSync(
    Queue.make<ReadingMemoryEvidenceProjectionRunReason>({
      capacity: 1,
      strategy: 'sliding',
    }),
  );
  let disposePromise: Promise<void> | undefined;
  let nextDelayMs = startupDelayMs;
  let nextReason: InternalRunReason = 'startup';

  const pass = Effect.gen(function* () {
    const request = yield* Queue.take(requests).pipe(Effect.timeoutOption(nextDelayMs));
    const reason = Option.getOrElse(request, () => nextReason);
    // A database lease must settle before shutdown releases this worker.
    const result = yield* Effect.tryPromise({
      try: () =>
        withDatabaseLease(async () =>
          runReadingMemoryEvidenceProjectionBatch(getSqliteExecutor(), {
            ...options.batchOptions,
            now: new Date(),
          }),
        ),
      catch: (error) => error,
    }).pipe(
      Effect.uninterruptible,
      Effect.catch((error) =>
        Effect.sync(() => {
          if (isDatabaseReplacing(error)) {
            logInfo('reading_memory.evidence_projection_database_wait', { reason });
          } else {
            logError('reading_memory.evidence_projection_batch_failed', error, { reason });
          }
          return undefined;
        }),
      ),
    );
    if (result) logBatchResult(reason, result);
    nextDelayMs = result?.hasImmediateWork ? 0 : idleDelayMs;
    nextReason = result?.hasImmediateWork ? 'continued' : 'poll';
  });
  Effect.runSync(
    Effect.forkIn(
      pass.pipe(Effect.repeat(Schedule.spaced(0)), Effect.ensuring(Queue.shutdown(requests))),
      scope,
      { startImmediately: true },
    ),
  );
  return {
    requestRun: (reason = 'manual') => {
      if (!disposePromise) Queue.offerUnsafe(requests, reason);
    },
    dispose: () => {
      disposePromise ??= Effect.runPromise(Scope.close(scope, Exit.void));
      return disposePromise;
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
