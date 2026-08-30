import { createHash } from 'node:crypto';
import { setImmediate } from 'node:timers/promises';
import {
  deriveReadingReviewSignals,
  rankReadingReviewCandidates,
  readingReviewSignalLimits,
  type ReadingReviewSignalCandidate,
} from '@yomitomo/core';
import type { ReadingEvidenceScope } from '@yomitomo/shared';
import type { ReadingReviewQueue, ReadingReviewQueueItem } from '../../ipc/reading-memory-domain';
import { materializeReadingEvidenceCandidates } from './reading-memory-evidence-search';
import { readingMemoryModelVectorDimension } from './reading-memory-model-manifest';
import { withReadingMemoryRequestContext } from './reading-memory-request';
import type { ReadingMemorySemanticIndex } from './reading-memory-semantic-index';
import {
  readReadingMemoryReviewVectorWindow,
  type ReadingMemoryReviewVector,
} from './reading-memory-vector-store';
import {
  readReadingReviewAssetPage,
  readReadingReviewAssets,
  type ReadingReviewAsset,
  type ReadingReviewAssetCursor,
} from './reading-review-source';

const libraryScope: ReadingEvidenceScope = { kind: 'library' };

type QueueCandidate = ReadingReviewSignalCandidate & {
  item: ReadingReviewQueueItem;
  assetVersion: string;
  judgmentDigest: string;
  headReviewId: string | null;
};

export function createReadingReviewQueue(options: {
  semanticIndex: Pick<ReadingMemorySemanticIndex, 'getStatus'>;
}) {
  return async (signal?: AbortSignal): Promise<ReadingReviewQueue> => {
    const now = new Date();
    const status = await options.semanticIndex.getStatus(libraryScope);
    const modelVersion = status.semantic.queryModelVersion;
    const initial = await readTimeCandidates(signal);
    const latestStatus = await options.semanticIndex.getStatus(libraryScope);
    const verified = await withReadingMemoryRequestContext(({ executor, generation }) => {
      assertCurrent(initial.generation, generation, signal);
      const currentAssets = new Map(
        readReadingReviewAssets(
          executor,
          initial.candidates.map((candidate) => candidate.item.asset),
        ).map((asset) => [evidenceId(asset), asset]),
      );
      const candidates = initial.candidates.filter((candidate) => {
        const current = currentAssets.get(candidate.id);
        return (
          current &&
          current.base.assetVersion === candidate.assetVersion &&
          (current.current.latestReview?.id ?? null) === candidate.headReviewId &&
          judgmentDigest(current) === candidate.judgmentDigest
        );
      });
      if (!modelVersion || latestStatus.semantic.queryModelVersion !== modelVersion) {
        return { candidates, candidateVectors: [], recentEvidence: [] };
      }
      const window = readReadingMemoryReviewVectorWindow(executor, {
        modelVersion,
        dimension: readingMemoryModelVectorDimension,
        candidateEvidenceIds: candidates.map((candidate) => candidate.id),
        now,
      });
      const rows = new Map(
        [...window.candidateVectors, ...window.recentEvidence].map((row) => [row.id, row]),
      );
      const currentEvidence = new Map(
        materializeReadingEvidenceCandidates(executor, [...rows.values()], libraryScope).map(
          (evidence) => [evidence.id, evidence],
        ),
      );
      const currentVectors = (vectors: ReadingMemoryReviewVector[]) =>
        vectors.flatMap((vector) => {
          const evidence = currentEvidence.get(vector.id);
          return evidence ? [{ ...vector, sourceCreatedAt: evidence.createdAt }] : [];
        });
      return {
        candidates,
        candidateVectors: currentVectors(window.candidateVectors),
        recentEvidence: currentVectors(window.recentEvidence),
      };
    });
    signal?.throwIfAborted();
    const signals = deriveReadingReviewSignals({ ...verified, now });
    return {
      items: rankReadingReviewCandidates(verified.candidates, signals).map(
        (candidate) => candidate.item,
      ),
      mode: signals.size > 0 && verified.recentEvidence.length > 0 ? 'semantic' : 'time',
      ...latestStatus,
      coverage: {
        eligibleAssetCount: initial.eligibleAssetCount,
        timeCandidateCount: verified.candidates.length,
        semanticCandidateCount: signals.size,
        recentEvidenceCount: verified.recentEvidence.length,
      },
      semanticWindow: {
        candidateLimit: readingReviewSignalLimits.candidateCount,
        evidenceLimit: readingReviewSignalLimits.recentEvidenceCount,
        lookbackDays: readingReviewSignalLimits.evidenceWindowDays,
      },
    };
  };
}

export function readingReviewQueueItem(asset: ReadingReviewAsset): ReadingReviewQueueItem {
  return {
    asset: {
      articleId: asset.base.articleId,
      annotationId: asset.base.annotationId,
      assetType: asset.base.assetType,
      assetId: asset.base.assetId,
    },
    source: asset.source,
    quote: asset.location.anchor.exact.trim().slice(0, 1200),
    formedAt: asset.base.formedAt,
    lastReviewedAt: asset.current.latestReview?.createdAt ?? null,
  };
}

async function readTimeCandidates(signal?: AbortSignal) {
  const candidates: QueueCandidate[] = [];
  let eligibleAssetCount = 0;
  let expectedGeneration: number | undefined;
  let cursor: ReadingReviewAssetCursor | undefined;
  let hasMore = true;
  while (hasMore) {
    hasMore = await withReadingMemoryRequestContext(({ executor, generation }) => {
      expectedGeneration ??= generation;
      assertCurrent(expectedGeneration, generation, signal);
      for (let batch = 0; batch < 8; batch += 1) {
        const page = readReadingReviewAssetPage(executor, cursor);
        for (const asset of page.assets) {
          const dueAt = asset.current.latestReview?.createdAt ?? asset.base.formedAt;
          if (!Number.isFinite(Date.parse(dueAt))) continue;
          eligibleAssetCount += 1;
          retainTimeCandidate(candidates, {
            id: evidenceId(asset),
            targetId: asset.base.annotationId,
            sourceCreatedAt: asset.base.formedAt,
            ...(asset.current.latestReview ? { lastReviewedAt: dueAt } : {}),
            item: readingReviewQueueItem(asset),
            assetVersion: asset.base.assetVersion,
            judgmentDigest: judgmentDigest(asset),
            headReviewId: asset.current.latestReview?.id ?? null,
          });
        }
        cursor = page.nextCursor ?? undefined;
        if (!page.nextCursor) return false;
      }
      return true;
    });
    if (hasMore) await setImmediate();
  }
  if (expectedGeneration === undefined) throw new Error('READING_MEMORY_SESSION_EXPIRED');
  return { candidates, eligibleAssetCount, generation: expectedGeneration };
}

function retainTimeCandidate(candidates: QueueCandidate[], next: QueueCandidate) {
  const dueAt = Date.parse(next.lastReviewedAt ?? next.sourceCreatedAt);
  let low = 0;
  let high = candidates.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const current = candidates[middle];
    const currentDue = Date.parse(current.lastReviewedAt ?? current.sourceCreatedAt);
    if (currentDue < dueAt || (currentDue === dueAt && current.id < next.id)) low = middle + 1;
    else high = middle;
  }
  if (low >= readingReviewSignalLimits.candidateCount) return;
  candidates.splice(low, 0, next);
  if (candidates.length > readingReviewSignalLimits.candidateCount) candidates.pop();
}

function evidenceId(asset: ReadingReviewAsset) {
  return `reading_evidence_${asset.base.assetType}:${asset.base.assetId}`;
}

function judgmentDigest(asset: ReadingReviewAsset) {
  return createHash('sha256').update(asset.current.content).digest('hex');
}

function assertCurrent(expected: number, current: number, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (expected !== current) throw new Error('READING_MEMORY_SESSION_EXPIRED');
}
