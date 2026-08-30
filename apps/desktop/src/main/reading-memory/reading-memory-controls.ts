import { join } from 'node:path';
import type { ReadingMemoryStatusSnapshot } from '../../ipc/reading-memory-domain';
import type { ReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { readingMemoryModelRelease } from './reading-memory-model-manifest';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';

export type ReadingMemoryControls = {
  status(): Promise<ReadingMemoryStatusSnapshot>;
  download(): Promise<ReadingMemoryStatusSnapshot>;
  cancel(): Promise<ReadingMemoryStatusSnapshot>;
  remove(): Promise<ReadingMemoryStatusSnapshot>;
  pause(): Promise<ReadingMemoryStatusSnapshot>;
  resume(): Promise<ReadingMemoryStatusSnapshot>;
  rebuild(): Promise<ReadingMemoryStatusSnapshot>;
  reconcile(reason?: string): Promise<void>;
  suspendForAppUpdate(): Promise<void>;
  resumeAfterAppUpdateFailure(): Promise<void>;
  dispose(): Promise<void>;
};

export function createReadingMemoryControls(options: {
  modelLifecycle: ReadingMemoryModelLifecycle;
  semanticIndex: ReadingMemorySemanticIndex;
  userDataPath: string;
  onProjectionRebuild?: () => void;
}): ReadingMemoryControls {
  const { modelLifecycle, semanticIndex, userDataPath } = options;
  let mode: 'running' | 'updating' | 'disposed' = 'running';
  let operationTail = Promise.resolve();
  let disposePromise: Promise<void> | null = null;
  let pendingDownload: {
    controller: AbortController;
    promise: Promise<ReadingMemoryStatusSnapshot>;
  } | null = null;

  const status = async (): Promise<ReadingMemoryStatusSnapshot> => {
    const indexStatus = await semanticIndex.getStatus();
    const model = modelLifecycle.getState();
    const downloadedBytes =
      model.status === 'downloading'
        ? model.downloadedBytes
        : model.status === 'not-installed' || model.status === 'failed'
          ? model.resumeBytes
          : 0;
    return {
      model: {
        status: model.status,
        internalId: model.internalId,
        downloadSizeBytes: model.downloadSizeBytes,
        downloadedBytes,
        directory: join(userDataPath, 'models', model.internalId),
        sourceUrl: readingMemoryModelRelease.manifestUrl,
        failure: model.status === 'failed' ? model.failure : null,
      },
      ...indexStatus,
    };
  };

  const enqueue = <T>(operation: () => Promise<T>) => {
    const result = operationTail.then(operation);
    operationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const requireRunning = () => {
    if (mode !== 'running') throw new Error('Reading memory controls are stopped');
  };

  const control = async (operation: () => Promise<void>) => {
    requireRunning();
    return enqueue(async () => {
      await operation();
      return status();
    });
  };

  const cancelDownload = async () => {
    pendingDownload?.controller.abort();
    await modelLifecycle.cancelDownload();
  };

  const rebuild = async () => {
    await semanticIndex.rebuild();
    options.onProjectionRebuild?.();
  };

  return {
    status,
    download: () => {
      if (pendingDownload && !pendingDownload.controller.signal.aborted) {
        return pendingDownload.promise;
      }
      const controller = new AbortController();
      const promise = control(async () => {
        if (controller.signal.aborted) return;
        const model = await modelLifecycle.download();
        if (model.status === 'available' && !controller.signal.aborted) {
          await semanticIndex.reconcile('model-downloaded');
        }
      }).finally(() => {
        if (pendingDownload?.promise === promise) pendingDownload = null;
      });
      pendingDownload = { controller, promise };
      return promise;
    },
    cancel: async () => {
      requireRunning();
      await cancelDownload();
      return status();
    },
    remove: async () => {
      requireRunning();
      const cancellation = cancelDownload();
      const removal = control(async () => {
        await semanticIndex.suspend();
        try {
          await modelLifecycle.remove();
        } finally {
          if (mode === 'running') await semanticIndex.resume();
        }
      });
      return Promise.all([cancellation, removal]).then(([, snapshot]) => snapshot);
    },
    pause: () => control(() => semanticIndex.pauseIndexing()),
    resume: () =>
      control(async () => {
        semanticIndex.resumeIndexing();
      }),
    rebuild: () => control(rebuild),
    reconcile: (reason) =>
      enqueue(async () => {
        if (mode !== 'running') return;
        if (reason === 'database-restored') await rebuild();
        await semanticIndex.reconcile(reason);
      }),
    suspendForAppUpdate: () => {
      if (disposePromise) return disposePromise;
      mode = 'updating';
      const cancellation = cancelDownload();
      const suspension = enqueue(() => semanticIndex.suspend());
      return Promise.all([cancellation, suspension]).then(() => undefined);
    },
    resumeAfterAppUpdateFailure: () => {
      if (disposePromise) return disposePromise;
      return enqueue(async () => {
        if (mode === 'disposed') return;
        await semanticIndex.resume();
        if (!disposePromise) mode = 'running';
      });
    },
    dispose: () => {
      if (disposePromise) return disposePromise;
      mode = 'disposed';
      const cancellation = cancelDownload();
      const disposal = enqueue(() => semanticIndex.dispose());
      disposePromise = Promise.all([cancellation, disposal]).then(() => undefined);
      return disposePromise;
    },
  };
}
