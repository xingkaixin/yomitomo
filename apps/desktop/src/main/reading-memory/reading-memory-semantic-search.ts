import { setImmediate } from 'node:timers/promises';
import { mergeReadingEvidenceCandidates } from '@yomitomo/core';
import type {
  ReadingEvidenceScope,
  ReadingMemoryEvidenceSearchResult,
  ReadingMemorySemanticStatus,
} from '@yomitomo/shared';
import {
  ReadingMemoryEmbeddingError,
  type ReadingMemoryEmbeddingResult,
  type ReadingMemoryModelInstallation,
} from './reading-memory-embedding-service';
import { assertReadingMemoryEmbeddingVectors } from './reading-memory-embedding-worker-protocol';
import {
  materializeReadingEvidenceCandidates,
  readKeywordReadingEvidenceCandidates,
  readReadingEvidenceProjectionStatus,
  searchReadingEvidence,
  type ReadingEvidenceCandidate,
} from './reading-memory-evidence-search';
import type {
  ReadingMemoryDatabase,
  ReadingMemorySqliteExecutor,
} from './reading-memory-store-types';
import {
  readActiveReadingMemoryModelVersion,
  readReadingMemoryVectorChunk,
  readReadingMemoryVectorCoverage,
} from './reading-memory-vector-store';

const vectorChunkSize = 256;
const semanticCandidateLimit = 40;

type SearchReadingMemoryEvidenceOptions = {
  query: string;
  scope: ReadingEvidenceScope;
  limit?: number;
  withDatabase: ReadingMemoryDatabase;
  selectModel: (executor: ReadingMemorySqliteExecutor) => ReadingMemoryModelInstallation | null;
  embedQuery: (
    installation: ReadingMemoryModelInstallation,
    text: string,
    signal: AbortSignal,
  ) => Promise<ReadingMemoryEmbeddingResult>;
  readSemanticStatus: (
    executor: ReadingMemorySqliteExecutor,
    scope: ReadingEvidenceScope,
  ) => ReadingMemorySemanticStatus;
  signal: AbortSignal;
  logError?: (event: string, error: unknown, data?: Record<string, unknown>) => void;
};

export async function searchReadingMemoryEvidence(
  options: SearchReadingMemoryEvidenceOptions,
): Promise<ReadingMemoryEvidenceSearchResult> {
  const { signal, scope, withDatabase } = options;
  signal.throwIfAborted();
  const query = options.query.trim().normalize();
  const limit = resultLimit(options.limit);
  const snapshot = await withDatabase((executor, generation) => {
    signal.throwIfAborted();
    const installation = options.selectModel(executor);
    return {
      generation,
      activeVersion: readActiveReadingMemoryModelVersion(executor),
      installation,
      keywordCandidates: readKeywordReadingEvidenceCandidates(executor, query, scope),
      indexedEntryCount:
        installation && query
          ? readReadingMemoryVectorCoverage(executor, {
              modelVersion: installation.manifest.internalId,
              dimension: installation.manifest.vector.dimension,
              scope,
            }).indexedEntryCount
          : 0,
    };
  });
  signal.throwIfAborted();

  const isCurrent = (executor: ReadingMemorySqliteExecutor, generation: number) =>
    generation === snapshot.generation &&
    readActiveReadingMemoryModelVersion(executor) === snapshot.activeVersion &&
    options.selectModel(executor)?.manifest.internalId ===
      snapshot.installation?.manifest.internalId;
  let semanticCandidates: ReadingEvidenceCandidate[] | null = null;
  let semanticFailed = false;
  if (snapshot.installation && snapshot.indexedEntryCount > 0) {
    try {
      const embedding = await options.embedQuery(snapshot.installation, query, signal);
      signal.throwIfAborted();
      const manifest = snapshot.installation.manifest;
      if (
        embedding.modelVersion !== manifest.internalId ||
        embedding.dimension !== manifest.vector.dimension
      ) {
        throw new Error('Query embedding does not match the selected model');
      }
      assertReadingMemoryEmbeddingVectors(
        embedding.vectors,
        1,
        embedding.dimension,
        manifest.vector.normalization === 'l2',
      );
      semanticCandidates = await readSemanticCandidates(options, embedding, isCurrent);
    } catch (error) {
      signal.throwIfAborted();
      semanticFailed = true;
      options.logError?.(
        'reading_memory.semantic_search_failed',
        new Error('Local semantic search failed'),
        error instanceof ReadingMemoryEmbeddingError ? { code: error.code } : undefined,
      );
    }
  }

  const result = await withDatabase((executor, generation): ReadingMemoryEvidenceSearchResult => {
    signal.throwIfAborted();
    const semantic = options.readSemanticStatus(executor, scope);
    const current = isCurrent(executor, generation);
    const semanticEvidence =
      current && semanticCandidates
        ? materializeReadingEvidenceCandidates(executor, semanticCandidates, scope)
        : [];
    if (semanticEvidence.length === 0) {
      return {
        ...searchReadingEvidence({ executor, query, scope, limit }),
        semantic: semanticFailed && current ? { ...semantic, state: 'failed' } : semantic,
        mode: 'keyword',
      };
    }
    const keywordEvidence = materializeReadingEvidenceCandidates(
      executor,
      snapshot.keywordCandidates,
      scope,
      query,
    );
    return {
      evidence: mergeReadingEvidenceCandidates(keywordEvidence, semanticEvidence, limit),
      projection: readReadingEvidenceProjectionStatus({ executor, scope }),
      semantic,
      mode: 'hybrid',
    };
  });
  signal.throwIfAborted();
  return result;
}

async function readSemanticCandidates(
  options: SearchReadingMemoryEvidenceOptions,
  embedding: ReadingMemoryEmbeddingResult,
  isCurrent: (executor: ReadingMemorySqliteExecutor, generation: number) => boolean,
): Promise<ReadingEvidenceCandidate[] | null> {
  const scored: { candidate: ReadingEvidenceCandidate; score: number }[] = [];
  let afterId: string | undefined;
  while (true) {
    options.signal.throwIfAborted();
    const chunk = await options.withDatabase((executor, generation) => {
      options.signal.throwIfAborted();
      return isCurrent(executor, generation)
        ? readReadingMemoryVectorChunk(executor, {
            modelVersion: embedding.modelVersion,
            dimension: embedding.dimension,
            scope: options.scope,
            afterId,
            limit: vectorChunkSize,
          })
        : null;
    });
    options.signal.throwIfAborted();
    if (!chunk) return null;
    for (const { vector, ...candidate } of chunk) {
      let score = 0;
      for (let index = 0; index < embedding.dimension; index += 1) {
        score += vector[index] * embedding.vectors[index];
      }
      if (Number.isFinite(score)) scored.push({ candidate, score });
    }
    if (chunk.length < vectorChunkSize) break;
    afterId = chunk[chunk.length - 1].id;
    await setImmediate(undefined, { signal: options.signal });
  }
  return scored
    .toSorted((left, right) => right.score - left.score)
    .slice(0, semanticCandidateLimit)
    .map(({ candidate }) => candidate);
}

function resultLimit(limit: number | undefined) {
  if (!Number.isSafeInteger(limit) || !limit || limit < 1) return 12;
  return Math.min(limit, 24);
}
