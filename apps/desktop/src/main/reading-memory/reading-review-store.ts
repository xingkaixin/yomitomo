import { createHash } from 'node:crypto';
import type {
  ReadingReviewAssetRef,
  ReadingReviewBase,
  ReadingReviewDecision,
  ReadingReviewEvent,
} from '@yomitomo/shared';
import { recordField, stringField } from '@yomitomo/shared';
import { queueStoredAnnotationThreadProjection } from './reading-memory-projection-job-queue';
import { withReadingMemoryTransaction } from './reading-memory-store';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';
import {
  readingReviewEventColumns,
  readReadingReviewAsset,
  type ReadingReviewAsset,
} from './reading-review-source';

export type AppendReadingReviewInput = {
  id: string;
  asset: ReadingReviewAssetRef;
  assetVersion: string;
  judgmentDigest: string;
  headReviewId: string | null;
  decision: ReadingReviewDecision;
  answer: string;
};

export type ReadingReviewHistoryCursor = Pick<ReadingReviewEvent, 'createdAt' | 'id'>;

export function appendReadingReview(
  executor: ReadingMemorySqliteExecutor,
  input: AppendReadingReviewInput,
): { asset: ReadingReviewAsset; event: ReadingReviewEvent } {
  if (input.answer.length > 8192 || (input.decision !== 'need_evidence' && !input.answer.trim())) {
    throw new Error('READING_REVIEW_INVALID_ANSWER');
  }
  return withReadingMemoryTransaction(executor, () => {
    const existing = executor
      .prepare(`SELECT ${readingReviewEventColumns} FROM reading_memory_reviews WHERE id = ?`)
      .get(input.id) as ReadingReviewEvent | undefined;
    const asset = readReadingReviewAsset(executor, input.asset);
    if (!asset) throw new Error('READING_REVIEW_CONFLICT');
    if (existing) {
      if (!matchesSubmittedReview(existing, input)) throw new Error('READING_REVIEW_CONFLICT');
      return { asset, event: existing };
    }
    if (
      asset.base.assetVersion !== input.assetVersion ||
      sha256(asset.current.content) !== input.judgmentDigest ||
      (asset.current.latestReview?.id ?? null) !== input.headReviewId ||
      hasReviewSuccessor(executor, input)
    ) {
      throw new Error('READING_REVIEW_CONFLICT');
    }
    const event: ReadingReviewEvent = {
      ...input.asset,
      id: input.id,
      assetVersion: input.assetVersion,
      judgmentSnapshot: asset.current.content,
      judgmentDigest: input.judgmentDigest,
      previousReviewId: input.headReviewId,
      decision: input.decision,
      answer: input.answer,
      createdAt: nextReviewTime(executor, asset.base),
    };
    executor
      .prepare(
        `INSERT INTO reading_memory_reviews (
id, article_id, annotation_id, asset_type, asset_id, asset_version,
judgment_snapshot, judgment_digest, previous_review_id, decision, answer, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.articleId,
        event.annotationId,
        event.assetType,
        event.assetId,
        event.assetVersion,
        event.judgmentSnapshot,
        event.judgmentDigest,
        event.previousReviewId,
        event.decision,
        event.answer,
        event.createdAt,
      );
    queueStoredAnnotationThreadProjection(executor, {
      articleId: event.articleId,
      annotationId: event.annotationId,
      queuedAt: event.createdAt,
    });
    const updated = readReadingReviewAsset(executor, input.asset);
    if (!updated) throw new Error('READING_REVIEW_CONFLICT');
    return { asset: updated, event };
  });
}

export function readReadingReviewHistory(
  executor: ReadingMemorySqliteExecutor,
  asset: ReadingReviewAssetRef,
  cursor?: ReadingReviewHistoryCursor,
): { events: ReadingReviewEvent[]; nextCursor: ReadingReviewHistoryCursor | null } {
  const cursorFilter = cursor ? ' AND (created_at, id) < (?, ?)' : '';
  const rows = executor
    .prepare(
      `SELECT ${readingReviewEventColumns} FROM reading_memory_reviews
WHERE article_id = ? AND annotation_id = ? AND asset_type = ? AND asset_id = ?${cursorFilter}
ORDER BY created_at DESC, id DESC LIMIT 51`,
    )
    .all(
      asset.articleId,
      asset.annotationId,
      asset.assetType,
      asset.assetId,
      ...(cursor ? [cursor.createdAt, cursor.id] : []),
    ) as ReadingReviewEvent[];
  const events = rows.slice(0, 50);
  const last = events[events.length - 1];
  return {
    events,
    nextCursor: rows.length > 50 && last ? { createdAt: last.createdAt, id: last.id } : null,
  };
}

function matchesSubmittedReview(event: ReadingReviewEvent, input: AppendReadingReviewInput) {
  return (
    event.articleId === input.asset.articleId &&
    event.annotationId === input.asset.annotationId &&
    event.assetType === input.asset.assetType &&
    event.assetId === input.asset.assetId &&
    event.assetVersion === input.assetVersion &&
    event.judgmentDigest === input.judgmentDigest &&
    event.judgmentDigest === sha256(event.judgmentSnapshot) &&
    event.previousReviewId === input.headReviewId &&
    event.decision === input.decision &&
    event.answer === input.answer
  );
}

function hasReviewSuccessor(
  executor: ReadingMemorySqliteExecutor,
  input: AppendReadingReviewInput,
) {
  return Boolean(
    executor
      .prepare(
        `SELECT id FROM reading_memory_reviews
WHERE asset_type = ? AND asset_id = ? AND asset_version = ? AND previous_review_id IS ?`,
      )
      .get(input.asset.assetType, input.asset.assetId, input.assetVersion, input.headReviewId),
  );
}

function nextReviewTime(executor: ReadingMemorySqliteExecutor, asset: ReadingReviewBase) {
  const row = executor
    .prepare(
      `SELECT MAX(created_at) AS createdAt FROM reading_memory_reviews
WHERE asset_type = ? AND asset_id = ?`,
    )
    .get(asset.assetType, asset.assetId);
  const previous = Date.parse(stringField(recordField(row, 'createdAt')));
  const next = new Date(
    Math.max(Date.now(), Date.parse(asset.formedAt), Number.isFinite(previous) ? previous + 1 : 0),
  );
  if (!Number.isFinite(next.getTime())) throw new Error('READING_REVIEW_CONFLICT');
  return next.toISOString();
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
