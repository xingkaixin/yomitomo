import { createHash } from 'node:crypto';
import {
  foldReadingReviews,
  projectableReadingCommentAuthorKind,
  selectProjectableReadingJudgments,
} from '@yomitomo/core';
import type {
  ReadingEvidence,
  ReadingReviewAssetRef,
  ReadingReviewBase,
  ReadingReviewEvent,
  ReadingReviewFold,
} from '@yomitomo/shared';
import { normalizeArticleSourceType, recordField, stringField } from '@yomitomo/shared';
import { normalizeTextAnchor } from '../store/store-normalizers-annotations';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

const sourceBatchSize = 64;

export type ReadingReviewAsset = {
  base: ReadingReviewBase;
  current: ReadingReviewFold;
  source: ReadingEvidence['source'];
  location: ReadingEvidence['location'];
};

export type ReadingReviewAssetCursor = Pick<ReadingReviewAssetRef, 'assetType' | 'assetId'>;

export const readingReviewEventColumns = `
id, article_id AS articleId, annotation_id AS annotationId,
asset_type AS assetType, asset_id AS assetId, asset_version AS assetVersion,
judgment_snapshot AS judgmentSnapshot, judgment_digest AS judgmentDigest,
previous_review_id AS previousReviewId, decision, answer, created_at AS createdAt`;

const sourceColumns = `
annotation.id AS annotation_id, annotation.article_id, annotation.anchor,
article.title, article.byline, article.source_type`;

export function readReadingReviewAsset(
  executor: ReadingMemorySqliteExecutor,
  asset: ReadingReviewAssetRef,
): ReadingReviewAsset | null {
  return readReadingReviewAssets(executor, [asset])[0] || null;
}

export function readReadingReviewAssets(
  executor: ReadingMemorySqliteExecutor,
  assets: readonly ReadingReviewAssetRef[],
): ReadingReviewAsset[] {
  const uniqueAssets = [...new Map(assets.map((asset) => [assetKey(asset), asset])).values()];
  const result: ReadingReviewAsset[] = [];
  for (let offset = 0; offset < uniqueAssets.length; offset += sourceBatchSize) {
    result.push(...readAssetBatch(executor, uniqueAssets.slice(offset, offset + sourceBatchSize)));
  }
  return result;
}

export function readReadingReviewAssetPage(
  executor: ReadingMemorySqliteExecutor,
  cursor?: ReadingReviewAssetCursor,
): { assets: ReadingReviewAsset[]; nextCursor: ReadingReviewAssetCursor | null } {
  const refs: ReadingReviewAssetRef[] = [];
  if (cursor?.assetType !== 'distillation') {
    refs.push(
      ...(executor
        .prepare(
          `SELECT annotation.article_id AS articleId, annotation.id AS annotationId,
  'comment' AS assetType, comment.id AS assetId
FROM comments AS comment
JOIN annotations AS annotation ON annotation.id = comment.annotation_id
JOIN articles AS article ON article.id = annotation.article_id
WHERE comment.id > ? ORDER BY comment.id LIMIT ?`,
        )
        .all(cursor?.assetId || '', sourceBatchSize) as ReadingReviewAssetRef[]),
    );
  }
  if (refs.length < sourceBatchSize) {
    refs.push(
      ...(executor
        .prepare(
          `SELECT annotation.article_id AS articleId, annotation.id AS annotationId,
  'distillation' AS assetType, annotation.id AS assetId
FROM annotations AS annotation
JOIN articles AS article ON article.id = annotation.article_id
WHERE annotation.id > ? ORDER BY annotation.id LIMIT ?`,
        )
        .all(
          cursor?.assetType === 'distillation' ? cursor.assetId : '',
          sourceBatchSize - refs.length,
        ) as ReadingReviewAssetRef[]),
    );
  }
  const last = refs[refs.length - 1];
  return {
    assets: readReadingReviewAssets(executor, refs),
    nextCursor:
      refs.length === sourceBatchSize && last
        ? { assetType: last.assetType, assetId: last.assetId }
        : null,
  };
}

function readAssetBatch(executor: ReadingMemorySqliteExecutor, refs: ReadingReviewAssetRef[]) {
  const comments = refs.filter((ref) => ref.assetType === 'comment');
  const distillations = refs.filter((ref) => ref.assetType === 'distillation');
  const rows: { ref: ReadingReviewAssetRef; row: unknown }[] = [];
  if (comments.length > 0) {
    const sources = executor
      .prepare(
        `SELECT ${sourceColumns}, comment.id, comment.author, comment.content,
comment.pending, comment.created_at, comment.user_id,
comment.agent_id, comment.asset_revision
FROM comments AS comment
JOIN annotations AS annotation ON annotation.id = comment.annotation_id
JOIN articles AS article ON article.id = annotation.article_id
WHERE comment.id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(comments.map((ref) => ref.assetId)));
    for (const row of sources) {
      const ref = comments.find((item) => item.assetId === stringField(recordField(row, 'id')));
      if (ref) rows.push({ ref, row });
    }
  }
  if (distillations.length > 0) {
    const sources = executor
      .prepare(
        `SELECT ${sourceColumns}, annotation.id, annotation.created_at,
annotation.distillation_status, annotation.distillation_content,
annotation.distillation_published_at,
annotation.distillation_revision
FROM annotations AS annotation
JOIN articles AS article ON article.id = annotation.article_id
WHERE annotation.id IN (SELECT value FROM json_each(?))`,
      )
      .all(JSON.stringify(distillations.map((ref) => ref.assetId)));
    for (const row of sources) {
      const ref = distillations.find(
        (item) => item.assetId === stringField(recordField(row, 'id')),
      );
      if (ref) rows.push({ ref, row });
    }
  }
  const participatingThreads = readParticipatingThreads(
    executor,
    rows.flatMap(({ ref, row }) =>
      ref.assetType === 'comment' &&
      projectableReadingCommentAuthorKind(commentFromRow(row)) === 'ai'
        ? [ref.annotationId]
        : [],
    ),
  );
  const assets = rows.flatMap(({ ref, row }) => {
    const asset = materializeAsset(ref, row, participatingThreads);
    return asset ? [asset] : [];
  });
  const reviewedAssets = readReviewedAssetKeys(
    executor,
    assets.map((asset) => asset.base),
  );
  return assets.map((asset) => {
    const ref = asset.base;
    let events: ReadingReviewEvent[] = [];
    if (reviewedAssets.has(`${ref.assetType}:${ref.assetId}`)) {
      events = executor
        .prepare(
          `SELECT ${readingReviewEventColumns} FROM reading_memory_reviews
WHERE asset_type = ? AND asset_id = ? AND asset_version = ?
ORDER BY created_at, id`,
        )
        .all(ref.assetType, ref.assetId, ref.assetVersion) as ReadingReviewEvent[];
    }
    return Object.assign(asset, { current: foldReadingReviews(ref, events, sha256) });
  });
}

function readReviewedAssetKeys(executor: ReadingMemorySqliteExecutor, bases: ReadingReviewBase[]) {
  if (bases.length === 0) return new Set<string>();
  const rows = executor
    .prepare(
      `SELECT json_extract(requested.value, '$[0]') AS assetType,
  json_extract(requested.value, '$[1]') AS assetId
FROM json_each(?) AS requested
WHERE EXISTS (
  SELECT 1 FROM reading_memory_reviews AS review
  WHERE review.asset_type = json_extract(requested.value, '$[0]')
    AND review.asset_id = json_extract(requested.value, '$[1]')
    AND review.asset_version = json_extract(requested.value, '$[2]')
)`,
    )
    .all(JSON.stringify(bases.map((base) => [base.assetType, base.assetId, base.assetVersion])));
  return new Set(
    rows.map(
      (row) =>
        `${stringField(recordField(row, 'assetType'))}:${stringField(recordField(row, 'assetId'))}`,
    ),
  );
}

function readParticipatingThreads(executor: ReadingMemorySqliteExecutor, annotationIds: string[]) {
  const remaining = new Set(annotationIds);
  const participating = new Set<string>();
  let lastId = '';
  while (remaining.size > 0) {
    const rows = executor
      .prepare(
        `SELECT id, annotation_id, author, content, pending FROM comments
WHERE annotation_id IN (SELECT value FROM json_each(?))
  AND author <> 'ai' AND (pending IS NULL OR pending <> 1) AND id > ?
ORDER BY id LIMIT ${sourceBatchSize}`,
      )
      .all(JSON.stringify([...remaining]), lastId);
    for (const row of rows) {
      lastId = stringField(recordField(row, 'id'));
      if (projectableReadingCommentAuthorKind(commentFromRow(row)) !== 'user') continue;
      const annotationId = stringField(recordField(row, 'annotation_id'));
      remaining.delete(annotationId);
      participating.add(annotationId);
    }
    if (rows.length < sourceBatchSize) break;
  }
  return participating;
}

function materializeAsset(
  ref: ReadingReviewAssetRef,
  row: unknown,
  participatingThreads: ReadonlySet<string>,
): Omit<ReadingReviewAsset, 'current'> | null {
  if (
    ref.articleId !== stringField(recordField(row, 'article_id')) ||
    ref.annotationId !== stringField(recordField(row, 'annotation_id'))
  ) {
    return null;
  }
  const base = readingReviewBase(ref, row, participatingThreads);
  if (!base) return null;
  const byline = stringField(recordField(row, 'byline'));
  return {
    base,
    source: {
      ref: { kind: 'article', id: ref.articleId },
      sourceType: normalizeArticleSourceType(recordField(row, 'source_type')),
      title: stringField(recordField(row, 'title')),
      ...(byline ? { byline } : {}),
    },
    location: {
      annotationId: ref.annotationId,
      ...(ref.assetType === 'comment' ? { commentId: ref.assetId } : {}),
      anchor: normalizeTextAnchor(jsonValue(recordField(row, 'anchor'))),
    },
  };
}

function readingReviewBase(
  ref: ReadingReviewAssetRef,
  row: unknown,
  participatingThreads: ReadonlySet<string>,
): ReadingReviewBase | null {
  if (ref.assetType === 'comment') {
    const comment = commentFromRow(row);
    const authorKind = projectableReadingCommentAuthorKind(comment);
    const revision = stringField(recordField(row, 'asset_revision'));
    if (!authorKind || !revision) return null;
    if (authorKind === 'ai' && !participatingThreads.has(ref.annotationId)) return null;
    const formedAt = stringField(recordField(row, 'created_at'));
    return {
      ...ref,
      content: comment.content.trim(),
      authorKind,
      formedAt,
      assetVersion: sha256(
        JSON.stringify([
          'reading-review:comment:v1',
          ref.articleId,
          ref.annotationId,
          ref.assetId,
          revision,
          comment,
          recordField(row, 'user_id'),
          recordField(row, 'agent_id'),
        ]),
      ),
    };
  }
  if (ref.assetId !== ref.annotationId) return null;
  const content = stringField(recordField(row, 'distillation_content'));
  const status = recordField(row, 'distillation_status');
  const revision = stringField(recordField(row, 'distillation_revision'));
  const { distillationContent } = selectProjectableReadingJudgments({
    comments: [],
    distillation: { status: status === 'published' ? 'published' : 'unpublished', content },
  });
  if (!distillationContent || !revision) return null;
  const publishedAt = stringField(recordField(row, 'distillation_published_at'));
  return {
    ...ref,
    content: distillationContent,
    formedAt: publishedAt || stringField(recordField(row, 'created_at')),
    assetVersion: sha256(
      JSON.stringify([
        'reading-review:distillation:v1',
        ref.articleId,
        ref.annotationId,
        ref.assetId,
        revision,
        status,
        content,
      ]),
    ),
  };
}

function commentFromRow(row: unknown) {
  const pending = recordField(row, 'pending');
  return {
    content: stringField(recordField(row, 'content')),
    author: { kind: recordField(row, 'author') === 'ai' ? ('agent' as const) : ('user' as const) },
    pending: pending === true || pending === 1,
  };
}

function assetKey(asset: ReadingReviewAssetRef) {
  return JSON.stringify([asset.articleId, asset.annotationId, asset.assetType, asset.assetId]);
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function jsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}
