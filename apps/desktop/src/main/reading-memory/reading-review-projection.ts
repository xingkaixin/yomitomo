import type { ReadingReviewAssetRef, ReadingReviewFold } from '@yomitomo/shared';
import { recordField, stringField, uniqueNonEmptyStrings } from '@yomitomo/shared';
import { readReadingReviewAssets } from './reading-review-source';
import type { ReadingMemorySqliteExecutor } from './reading-memory-store-types';

export function readReadingReviewProjectionFolds(
  executor: ReadingMemorySqliteExecutor,
  annotationIds: readonly string[],
): Map<string, Map<string, ReadingReviewFold>> {
  const ids = uniqueNonEmptyStrings(annotationIds);
  const refs: ReadingReviewAssetRef[] = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = ids.slice(offset, offset + 200);
    const rows = executor
      .prepare(
        `
SELECT DISTINCT review.article_id, review.annotation_id, review.asset_type, review.asset_id
FROM annotations AS annotation
JOIN reading_memory_reviews AS review
  ON review.article_id = annotation.article_id AND review.annotation_id = annotation.id
WHERE annotation.id IN (${batch.map(() => '?').join(', ')})
`,
      )
      .all(...batch);
    for (const row of rows) {
      const assetType = recordField(row, 'asset_type');
      if (assetType !== 'comment' && assetType !== 'distillation') continue;
      refs.push({
        articleId: stringField(recordField(row, 'article_id')),
        annotationId: stringField(recordField(row, 'annotation_id')),
        assetType,
        assetId: stringField(recordField(row, 'asset_id')),
      });
    }
  }

  const byAnnotation = new Map<string, Map<string, ReadingReviewFold>>();
  for (const asset of readReadingReviewAssets(executor, refs)) {
    if (!asset.current.latestReview) continue;
    const entries = byAnnotation.get(asset.base.annotationId) ?? new Map();
    entries.set(`reading_evidence_${asset.base.assetType}:${asset.base.assetId}`, asset.current);
    byAnnotation.set(asset.base.annotationId, entries);
  }
  return byAnnotation;
}
