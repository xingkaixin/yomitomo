import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingMemoryEvidenceProjectionBatchResult } from './reading-memory-evidence-projection-batch';

const testState = vi.hoisted(() => ({
  executor: { id: 'executor' },
  getSqliteExecutor: vi.fn(),
  withDatabaseLease: vi.fn(),
  runBatch: vi.fn(),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('../app/logger', () => ({
  logInfo: testState.logInfo,
  logError: testState.logError,
}));

vi.mock('../store/store-db', () => ({
  getSqliteExecutor: testState.getSqliteExecutor,
  withDatabaseLease: testState.withDatabaseLease,
}));

vi.mock('./reading-memory-evidence-projection-batch', () => ({
  runReadingMemoryEvidenceProjectionBatch: testState.runBatch,
}));

import { startReadingMemoryEvidenceProjectionWorker } from './reading-memory-evidence-projection-worker';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-08-29T00:00:00.000Z');
  testState.getSqliteExecutor.mockReset().mockReturnValue(testState.executor);
  testState.withDatabaseLease.mockReset().mockImplementation(async (operation) => operation());
  testState.runBatch.mockReset().mockReturnValue(batchResult());
  testState.logInfo.mockReset();
  testState.logError.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('reading memory evidence projection worker', () => {
  it('starts after a delay and acquires a fresh executor inside the database lease', async () => {
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 20,
      idleDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(19);
    expect(testState.runBatch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(testState.withDatabaseLease).toHaveBeenCalledOnce();
    expect(testState.getSqliteExecutor).toHaveBeenCalledOnce();
    expect(testState.runBatch).toHaveBeenCalledWith(
      testState.executor,
      expect.objectContaining({ now: new Date('2026-08-29T00:00:00.020Z') }),
    );
    expect(testState.withDatabaseLease.mock.invocationCallOrder[0]).toBeLessThan(
      testState.getSqliteExecutor.mock.invocationCallOrder[0] || 0,
    );
    worker.dispose();
  });

  it('yields between full batches and reacquires the executor', async () => {
    testState.runBatch
      .mockReturnValueOnce(batchResult({ selectedJobCount: 2, hasImmediateWork: true }))
      .mockReturnValueOnce(batchResult());
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 10,
      idleDelayMs: 100,
    });

    await vi.advanceTimersToNextTimerAsync();

    expect(testState.runBatch).toHaveBeenCalledTimes(2);
    expect(testState.withDatabaseLease).toHaveBeenCalledTimes(2);
    expect(testState.getSqliteExecutor).toHaveBeenCalledTimes(2);
    worker.dispose();
  });

  it('coalesces requests received during a run without overlapping batches', async () => {
    const gate = deferred<void>();
    let activeLeaseCount = 0;
    let maximumLeaseCount = 0;
    testState.withDatabaseLease
      .mockImplementationOnce(async (operation) => {
        activeLeaseCount += 1;
        maximumLeaseCount = Math.max(maximumLeaseCount, activeLeaseCount);
        await gate.promise;
        try {
          return await operation();
        } finally {
          activeLeaseCount -= 1;
        }
      })
      .mockImplementation(async (operation) => {
        activeLeaseCount += 1;
        maximumLeaseCount = Math.max(maximumLeaseCount, activeLeaseCount);
        try {
          return await operation();
        } finally {
          activeLeaseCount -= 1;
        }
      });
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 0,
      idleDelayMs: 100,
    });
    await vi.advanceTimersByTimeAsync(0);

    worker.requestRun('source_changed');
    worker.requestRun('database_restored');
    expect(testState.runBatch).not.toHaveBeenCalled();
    gate.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(testState.runBatch).toHaveBeenCalledTimes(2);
    expect(maximumLeaseCount).toBe(1);
    worker.dispose();
  });

  it('lets an explicit request preempt the delayed startup timer', async () => {
    testState.runBatch.mockReturnValue(batchResult({ selectedJobCount: 1, completedJobCount: 1 }));
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 100,
      idleDelayMs: 1_000,
    });

    worker.requestRun('database_restored');
    await vi.advanceTimersByTimeAsync(0);

    expect(testState.runBatch).toHaveBeenCalledOnce();
    expect(testState.logInfo).toHaveBeenCalledWith(
      'reading_memory.evidence_projection_batch_complete',
      expect.objectContaining({ reason: 'database_restored' }),
    );
    worker.dispose();
  });

  it('waits quietly when the database is being replaced', async () => {
    const error = new Error('DATA_MANAGEMENT_DATABASE_REPLACING');
    testState.withDatabaseLease.mockRejectedValueOnce(error);
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 0,
      idleDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(testState.getSqliteExecutor).not.toHaveBeenCalled();
    expect(testState.logInfo).toHaveBeenCalledWith(
      'reading_memory.evidence_projection_database_wait',
      { reason: 'startup' },
    );
    expect(testState.logError).not.toHaveBeenCalled();
    worker.dispose();
  });

  it('logs retained job failures and keeps polling', async () => {
    const error = new Error('projection failed');
    testState.runBatch.mockReturnValue(
      batchResult({
        selectedJobCount: 1,
        failures: [
          {
            job: {
              targetType: 'annotation_thread',
              targetId: 'annotation_1',
              articleId: 'article_1',
              sourceVersion: 'source_1',
              operation: 'upsert',
              queuedAt: '2026-08-29T00:00:00.000Z',
              attemptCount: 2,
              availableAt: '2026-08-29T00:00:00.000Z',
              lastErrorAt: null,
            },
            error,
            retryAt: '2026-08-29T00:00:20.000Z',
          },
        ],
      }),
    );
    const worker = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 0,
      idleDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(testState.logError).toHaveBeenCalledWith(
      'reading_memory.evidence_projection_job_failed',
      error,
      expect.objectContaining({
        targetId: 'annotation_1',
        attemptCount: 3,
        retryAt: '2026-08-29T00:00:20.000Z',
      }),
    );
    await vi.advanceTimersByTimeAsync(100);
    expect(testState.runBatch).toHaveBeenCalledTimes(2);
    worker.dispose();
  });

  it('disposes pending and in-flight schedules without starting another batch', async () => {
    const pending = startReadingMemoryEvidenceProjectionWorker({ startupDelayMs: 20 });
    pending.dispose();
    await vi.advanceTimersByTimeAsync(20);
    expect(testState.runBatch).not.toHaveBeenCalled();

    const gate = deferred<void>();
    testState.withDatabaseLease.mockImplementationOnce(async (operation) => {
      const result = await operation();
      await gate.promise;
      return result;
    });
    const running = startReadingMemoryEvidenceProjectionWorker({
      startupDelayMs: 0,
      idleDelayMs: 10,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(testState.runBatch).toHaveBeenCalledOnce();
    running.dispose();
    gate.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(100);

    expect(testState.runBatch).toHaveBeenCalledOnce();
  });
});

function batchResult(
  overrides: Partial<ReadingMemoryEvidenceProjectionBatchResult> = {},
): ReadingMemoryEvidenceProjectionBatchResult {
  return {
    selectedJobCount: 0,
    completedJobCount: 0,
    refreshedJobCount: 0,
    queuedBackfillCount: 0,
    deletedOrphanCount: 0,
    failures: [],
    hasImmediateWork: false,
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
