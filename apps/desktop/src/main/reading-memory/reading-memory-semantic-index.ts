import type {
  ReadingEvidenceProjectionStatus,
  ReadingEvidenceScope,
  ReadingMemoryEvidenceSearchResult,
  ReadingMemorySemanticStatus,
} from '@yomitomo/shared';
import {
  createReadingMemoryEmbeddingService,
  type ReadingMemoryEmbeddingService,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import {
  maximumReadingMemoryEmbeddingTextBytes,
  type ReadingMemoryEmbeddingPurpose,
} from './reading-memory-embedding-worker-protocol';
import { readReadingEvidenceProjectionStatus } from './reading-memory-evidence-search';
import type { ReadingMemoryModelLifecycle } from './reading-memory-model-lifecycle';
import { readingMemoryModelVectorDimension } from './reading-memory-model-manifest';
import { searchReadingMemoryEvidence } from './reading-memory-semantic-search';
import type {
  ReadingMemoryDatabase,
  ReadingMemorySqliteExecutor,
} from './reading-memory-store-types';
import {
  activateReadingMemoryModelVersion,
  deleteReadingMemoryModelVectors,
  readActiveReadingMemoryModelVersion,
  readMissingReadingMemoryVectors,
  readReadingMemoryVectorCoverage,
  writeReadingMemoryVectors,
} from './reading-memory-vector-store';

const libraryScope: ReadingEvidenceScope = { kind: 'library' };
const backgroundBatchSize = 4;
const idleDelayMs = 5_000;
const retryDelayMs = 30_000;

type EmbeddingSlot = {
  installation: ReadingMemoryModelInstallation;
  service: ReadingMemoryEmbeddingService;
};

type SemanticIndexOptions = {
  modelLifecycle: ReadingMemoryModelLifecycle;
  previousModelLifecycle?: ReadingMemoryModelLifecycle;
  withDatabase: ReadingMemoryDatabase;
  createEmbedding?: typeof createReadingMemoryEmbeddingService;
  logInfo?: (event: string, data?: Record<string, unknown>) => void;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export type ReadingMemorySemanticIndex = {
  reconcile(reason?: string): Promise<void>;
  search(
    input: { query: string; scope: ReadingEvidenceScope; limit?: number },
    options?: { signal?: AbortSignal },
  ): Promise<ReadingMemoryEvidenceSearchResult>;
  getStatus(scope?: ReadingEvidenceScope): Promise<{
    projection: ReadingEvidenceProjectionStatus;
    semantic: ReadingMemorySemanticStatus;
  }>;
  pauseIndexing(): Promise<void>;
  resumeIndexing(): void;
  rebuild(): Promise<void>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  dispose(): Promise<void>;
};

export function createReadingMemorySemanticIndex(
  options: SemanticIndexOptions,
): ReadingMemorySemanticIndex {
  const createEmbedding = options.createEmbedding ?? createReadingMemoryEmbeddingService;
  const slots: Record<ReadingMemoryEmbeddingPurpose, EmbeddingSlot | null> = {
    query: null,
    document: null,
  };
  const queries = new Set<AbortController>();
  let mode: 'running' | 'suspended' | 'disposed' = 'running';
  let indexingPaused = false;
  let indexingFailed = false;
  let timer: NodeJS.Timeout | null = null;
  let background: { controller: AbortController; promise: Promise<void> } | null = null;
  let queryTail = Promise.resolve();
  let maintenance: Promise<void> | null = null;
  let disposePromise: Promise<void> | null = null;

  const selectModel = (executor: ReadingMemorySqliteExecutor) => {
    const target = installedModel(options.modelLifecycle);
    const previous = installedModel(options.previousModelLifecycle);
    const activeVersion = readActiveReadingMemoryModelVersion(executor);
    return [target, previous].find((model) => model?.internalId === activeVersion) ?? target;
  };

  const readSemanticStatus = (
    executor: ReadingMemorySqliteExecutor,
    scope: ReadingEvidenceScope,
  ): ReadingMemorySemanticStatus => {
    const model = options.modelLifecycle.getState();
    const queryModel = selectModel(executor);
    const coverage = readReadingMemoryVectorCoverage(executor, {
      modelVersion: model.internalId,
      dimension:
        model.status === 'available'
          ? model.manifest.vector.dimension
          : readingMemoryModelVectorDimension,
      scope,
    });
    const projection = readReadingEvidenceProjectionStatus({ executor, scope });
    const state = semanticState({
      modelStatus: model.status,
      rebuilding: Boolean(queryModel && queryModel.internalId !== model.internalId),
      complete:
        coverage.indexedEntryCount === coverage.eligibleEntryCount &&
        projection.state === 'available',
      failed: indexingFailed,
    });
    return {
      state,
      modelVersion: model.internalId,
      queryModelVersion: queryModel?.internalId ?? null,
      coverage,
      indexingPaused,
    };
  };

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const embed = async (
    purpose: ReadingMemoryEmbeddingPurpose,
    installation: ReadingMemoryModelInstallation,
    texts: readonly string[],
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted();
    const current = slots[purpose];
    if (
      current &&
      (current.installation.internalId !== installation.internalId ||
        current.installation.directory !== installation.directory)
    ) {
      await current.service.dispose();
      if (slots[purpose] === current) slots[purpose] = null;
    }
    signal.throwIfAborted();
    const slot = (slots[purpose] ??= { installation, service: createEmbedding(installation) });
    return slot.service.embed({ purpose, texts: texts.map(embeddingText) }, { signal });
  };

  const retirePreviousModel = async (generation: number, signal: AbortSignal) => {
    const target = installedModel(options.modelLifecycle);
    const previous = installedModel(options.previousModelLifecycle);
    if (!target || !previous || target.internalId === previous.internalId) return;
    const oldQuery = slots.query;
    if (oldQuery?.installation.internalId === previous.internalId) {
      slots.query = null;
      await oldQuery.service.dispose();
    }
    signal.throwIfAborted();
    const deleted = await options.withDatabase((executor, currentGeneration) => {
      signal.throwIfAborted();
      if (
        currentGeneration !== generation ||
        readActiveReadingMemoryModelVersion(executor) !== target.internalId
      )
        return false;
      deleteReadingMemoryModelVectors(executor, previous.internalId);
      return true;
    });
    signal.throwIfAborted();
    if (deleted) await options.previousModelLifecycle?.remove();
  };

  const buildNextBatch = async (signal: AbortSignal): Promise<number> => {
    const installation = installedModel(options.modelLifecycle);
    if (!installation) return idleDelayMs;
    const model = {
      modelVersion: installation.internalId,
      dimension: installation.manifest.vector.dimension,
    };
    const snapshot = await options.withDatabase((executor, generation) => {
      signal.throwIfAborted();
      return {
        generation,
        entries: readMissingReadingMemoryVectors(executor, {
          ...model,
          limit: backgroundBatchSize,
        }),
      };
    });
    signal.throwIfAborted();
    if (snapshot.entries.length > 0) {
      const result = await embed(
        'document',
        installation,
        snapshot.entries.map((entry) => entry.searchText),
        signal,
      );
      signal.throwIfAborted();
      if (result.modelVersion !== model.modelVersion || result.dimension !== model.dimension) {
        throw new Error('Reading memory embedding model changed during indexing');
      }
      const written = await options.withDatabase((executor, generation) => {
        signal.throwIfAborted();
        if (generation !== snapshot.generation) return 0;
        return writeReadingMemoryVectors(executor, {
          ...model,
          entries: snapshot.entries,
          vectors: result.vectors,
        });
      });
      options.logInfo?.('reading_memory.semantic_batch_indexed', {
        modelVersion: model.modelVersion,
        requestedCount: snapshot.entries.length,
        writtenCount: written,
      });
      indexingFailed = false;
      return written > 0 ? 0 : idleDelayMs;
    }
    const activated = await options.withDatabase((executor, generation) => {
      signal.throwIfAborted();
      return (
        generation === snapshot.generation && activateReadingMemoryModelVersion(executor, model)
      );
    });
    if (activated) await retirePreviousModel(snapshot.generation, signal);
    indexingFailed = false;
    return idleDelayMs;
  };

  const schedule = (delayMs = 0) => {
    if (
      mode !== 'running' ||
      maintenance ||
      indexingPaused ||
      queries.size > 0 ||
      background ||
      timer
    ) {
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      const controller = new AbortController();
      let nextDelay = idleDelayMs;
      const promise = buildNextBatch(controller.signal)
        .then((delay) => {
          nextDelay = delay;
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          indexingFailed = true;
          nextDelay = retryDelayMs;
          options.logError?.('reading_memory.semantic_index_failed', error);
        })
        .finally(() => {
          background = null;
          schedule(nextDelay);
        });
      background = { controller, promise };
    }, delayMs);
    timer.unref?.();
  };

  const abortWork = () => {
    clearTimer();
    background?.controller.abort();
    for (const controller of queries) controller.abort();
  };

  const releaseInference = async () => {
    const services = [slots.query, slots.document];
    slots.query = null;
    slots.document = null;
    await Promise.all([...services.map((slot) => slot?.service.dispose()), background?.promise]);
  };

  const maintain = (operation: () => Promise<void>): Promise<void> => {
    abortWork();
    const pending = (maintenance ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        await releaseInference();
        await operation();
      })
      .finally(() => {
        if (maintenance !== pending) return;
        maintenance = null;
        schedule();
      });
    maintenance = pending;
    return pending;
  };

  const reconcileModels = async (reason: string) => {
    if (mode === 'disposed') return;
    await Promise.all([
      options.modelLifecycle.reconcile(reason),
      options.previousModelLifecycle?.reconcile(reason),
    ]);
    indexingFailed = false;
    schedule();
  };

  return {
    reconcile: async (reason = 'manual') => {
      await maintain(async () => {});
      await reconcileModels(reason);
    },
    getStatus: (scope = libraryScope) =>
      options.withDatabase((executor) => ({
        projection: readReadingEvidenceProjectionStatus({ executor, scope }),
        semantic: readSemanticStatus(executor, scope),
      })),
    search: (input, callOptions = {}) => {
      const controller = new AbortController();
      const signal = callOptions.signal
        ? AbortSignal.any([controller.signal, callOptions.signal])
        : controller.signal;
      queries.add(controller);
      clearTimer();
      background?.controller.abort();
      const waitingForMaintenance = maintenance;
      const waitingForBackground = background?.promise;
      const result = queryTail
        .then(async () => {
          await waitingForMaintenance;
          signal.throwIfAborted();
          if (mode !== 'running') throw new DOMException('Semantic index is stopped', 'AbortError');
          await waitingForBackground;
          signal.throwIfAborted();
          return searchReadingMemoryEvidence({
            ...input,
            withDatabase: options.withDatabase,
            selectModel,
            embedQuery: (installation, text, requestSignal) =>
              embed('query', installation, [text], requestSignal),
            readSemanticStatus,
            logError: options.logError,
            signal,
          });
        })
        .finally(() => {
          queries.delete(controller);
          schedule();
        });
      queryTail = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
    pauseIndexing: async () => {
      indexingPaused = true;
      clearTimer();
      background?.controller.abort();
      await background?.promise;
    },
    resumeIndexing: () => {
      indexingPaused = false;
      schedule();
    },
    rebuild: () =>
      maintain(async () => {
        if (mode === 'disposed') return;
        await options.withDatabase((executor) => {
          deleteReadingMemoryModelVectors(executor, options.modelLifecycle.getState().internalId);
        });
        indexingFailed = false;
      }),
    suspend: () =>
      maintain(async () => {
        if (mode !== 'disposed') mode = 'suspended';
      }),
    resume: async () => {
      await maintain(async () => {
        if (mode !== 'disposed') mode = 'running';
      });
      await reconcileModels('resume');
    },
    dispose: () => {
      if (disposePromise) return disposePromise;
      mode = 'disposed';
      options.modelLifecycle.dispose();
      options.previousModelLifecycle?.dispose();
      disposePromise = maintain(async () => {});
      return disposePromise;
    },
  };
}

function installedModel(
  lifecycle?: ReadingMemoryModelLifecycle,
): ReadingMemoryModelInstallation | null {
  const state = lifecycle?.getState();
  return state?.status === 'available' ? state : null;
}

function semanticState(input: {
  modelStatus: ReturnType<ReadingMemoryModelLifecycle['getState']>['status'];
  rebuilding: boolean;
  complete: boolean;
  failed: boolean;
}): ReadingMemorySemanticStatus['state'] {
  if (input.modelStatus === 'not-installed') return 'not_installed';
  if (input.modelStatus !== 'available') return input.modelStatus;
  if (input.failed) return 'failed';
  if (input.rebuilding) return 'rebuilding';
  return input.complete ? 'available' : 'building';
}

function embeddingText(text: string): string {
  let length = 0;
  let byteLength = 0;
  for (const character of text) {
    byteLength += Buffer.byteLength(character, 'utf8');
    if (byteLength > maximumReadingMemoryEmbeddingTextBytes) break;
    length += character.length;
  }
  return text.slice(0, length);
}
