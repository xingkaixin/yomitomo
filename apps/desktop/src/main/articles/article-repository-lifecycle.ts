import { recordField, stringField } from '@yomitomo/shared';
import {
  deleteReadingMemoryForArticle,
  withReadingMemoryTransaction,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import {
  queueDeletedAnnotationThreadProjection,
  queueStoredAnnotationThreadProjection,
} from '../reading-memory/reading-memory-projection-job-queue';
import { queueArticleSourceCleanup } from './article-source-cleanup';

export function deleteArticleRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
) {
  withReadingMemoryTransaction(executor, () => {
    const article = executor
      .prepare('SELECT source_type AS sourceType FROM articles WHERE id = ?')
      .get(articleId);
    queueArticleSourceCleanup(
      executor,
      articleId,
      stringField(recordField(article, 'sourceType')) || undefined,
    );
    deleteArticleLibraryReferences(executor, articleId);
    executor.prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  });
  tryDeleteReadingMemoryForArticle(executor, articleId);
  return { articleId };
}

function tryDeleteReadingMemoryForArticle(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
) {
  try {
    deleteReadingMemoryForArticle(articleId, executor);
  } catch (error) {
    console.warn('[reading-memory] cleanup article memory failed', { articleId, error });
  }
}

export function deleteAnnotationRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string },
) {
  const deletedAt = input.deletedAt || new Date().toISOString();
  const deletedAnnotationCount = withReadingMemoryTransaction(executor, () => {
    const deletedCount = runChanges(
      executor
        .prepare('DELETE FROM annotations WHERE article_id = ? AND id = ?')
        .run(input.articleId, input.annotationId),
    );
    if (deletedCount > 0) {
      queueDeletedAnnotationThreadProjection(executor, {
        articleId: input.articleId,
        annotationId: input.annotationId,
        queuedAt: deletedAt,
      });
    }
    return deletedCount;
  });
  const deletedMemoryCount =
    deletedAnnotationCount > 0
      ? trySoftDeleteAnnotationMemoryEntries(executor, {
          articleId: input.articleId,
          annotationId: input.annotationId,
          deletedAt,
        })
      : 0;
  return { deletedAnnotationCount, deletedMemoryCount };
}

export function deleteCommentRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; commentId: string; deletedAt?: string },
) {
  const deletedAt = input.deletedAt || new Date().toISOString();
  const result = withReadingMemoryTransaction(executor, () => {
    const commentIds = deletedCommentThreadIds(executor, input.annotationId, input.commentId);
    const deletedCommentCount = deleteCommentsByIds(executor, {
      articleId: input.articleId,
      annotationId: input.annotationId,
      commentIds,
    });
    if (deletedCommentCount > 0) {
      queueStoredAnnotationThreadProjection(executor, {
        articleId: input.articleId,
        annotationId: input.annotationId,
        queuedAt: deletedAt,
      });
    }
    return { commentIds, deletedCommentCount };
  });
  const deletedMemoryCount =
    result.deletedCommentCount > 0
      ? trySoftDeleteCommentMemoryEntries(executor, {
          articleId: input.articleId,
          commentIds: result.commentIds,
          deletedAt,
        })
      : 0;
  return { deletedCommentCount: result.deletedCommentCount, deletedMemoryCount };
}

export function softDeleteAnnotationMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string; useTransaction?: boolean },
) {
  return softDeleteOwnedMemoryEntries(executor, {
    articleId: input.articleId,
    where: `
(
  source_type = 'annotation'
  AND source_id = ?
  AND id = ?
)
OR (
  source_type = 'comment'
  AND source_annotation_id = ?
  AND source_comment_id IS NOT NULL
  AND id = 'comment_memory_' || source_comment_id
)
`,
    values: [input.annotationId, annotationMemoryEntryId(input.annotationId), input.annotationId],
    deletedAt: input.deletedAt,
    deletionReason: 'annotation_deleted',
    useTransaction: input.useTransaction,
  });
}

export function trySoftDeleteAnnotationMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string },
) {
  try {
    return softDeleteAnnotationMemoryEntries(executor, input);
  } catch (error) {
    console.warn('[reading-memory] cleanup annotation memory mirror failed', {
      articleId: input.articleId,
      annotationId: input.annotationId,
      error,
    });
    return 0;
  }
}

function deletedCommentThreadIds(
  executor: ReadingMemorySqliteExecutor,
  annotationId: string,
  commentId: string,
) {
  const rows = executor
    .prepare(
      `
SELECT id, reply_to AS replyTo
FROM comments
WHERE annotation_id = ?
`,
    )
    .all(annotationId);
  const childrenByParent = new Map<string, string[]>();
  const existingIds = new Set<string>();

  for (const row of rows) {
    const id = stringField(recordField(row, 'id'));
    const replyTo = stringField(recordField(row, 'replyTo'));
    if (!id) continue;
    existingIds.add(id);
    if (!replyTo) continue;
    const children = childrenByParent.get(replyTo) || [];
    children.push(id);
    childrenByParent.set(replyTo, children);
  }

  if (!existingIds.has(commentId)) return [];

  const deletedIds = new Set<string>();
  const queue = [commentId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index];
    if (deletedIds.has(id)) continue;
    deletedIds.add(id);
    queue.push(...(childrenByParent.get(id) || []));
  }
  return [...deletedIds].toSorted();
}

export function softDeleteCommentMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; commentIds: string[]; deletedAt?: string; useTransaction?: boolean },
) {
  if (input.commentIds.length === 0) return 0;
  const placeholders = sqlPlaceholders(input.commentIds);
  return softDeleteOwnedMemoryEntries(executor, {
    articleId: input.articleId,
    where: `
source_type = 'comment'
AND source_comment_id IN (${placeholders})
AND id = 'comment_memory_' || source_comment_id
`,
    values: input.commentIds,
    deletedAt: input.deletedAt,
    deletionReason: 'comment_deleted',
    useTransaction: input.useTransaction,
  });
}

export function trySoftDeleteCommentMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; commentIds: string[]; deletedAt?: string },
) {
  try {
    return softDeleteCommentMemoryEntries(executor, input);
  } catch (error) {
    console.warn('[reading-memory] cleanup comment memory mirror failed', {
      articleId: input.articleId,
      commentIds: input.commentIds,
      error,
    });
    return 0;
  }
}

function softDeleteOwnedMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: {
    articleId: string;
    where: string;
    values: string[];
    deletedAt?: string;
    deletionReason: string;
    useTransaction?: boolean;
  },
) {
  const run = () => {
    const deletedAt = input.deletedAt || new Date().toISOString();
    const ids = executor
      .prepare(
        `
SELECT id
FROM reading_memory_entries
WHERE article_id = ?
  AND deleted_at IS NULL
  AND (${input.where})
`,
      )
      .all(input.articleId, ...input.values)
      .map((row) => stringField(recordField(row, 'id')))
      .filter(Boolean);
    if (ids.length === 0) return 0;

    executor
      .prepare(
        `
UPDATE reading_memory_entries
SET deleted_at = ?, deletion_reason = ?, updated_at = ?
WHERE article_id = ?
  AND deleted_at IS NULL
  AND (${input.where})
`,
      )
      .run(deletedAt, input.deletionReason, deletedAt, input.articleId, ...input.values);
    executor
      .prepare(
        `
DELETE FROM reading_memory_entry_fts
WHERE article_id = ?
  AND entry_id IN (${sqlPlaceholders(ids)})
`,
      )
      .run(input.articleId, ...ids);
    executor
      .prepare('DELETE FROM reading_memory_projections WHERE article_id = ?')
      .run(input.articleId);
    return ids.length;
  };
  return input.useTransaction === false ? run() : withReadingMemoryTransaction(executor, run);
}

function annotationMemoryEntryId(annotationId: string) {
  return `annotation_memory_${annotationId}`;
}

function deleteCommentsByIds(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; commentIds: string[] },
) {
  if (input.commentIds.length === 0) return 0;

  return runChanges(
    executor
      .prepare(
        `
DELETE FROM comments
WHERE id IN (${sqlPlaceholders(input.commentIds)})
  AND annotation_id = ?
  AND EXISTS (
    SELECT 1 FROM annotations
    WHERE annotations.id = comments.annotation_id
      AND annotations.article_id = ?
  )
`,
      )
      .run(...input.commentIds, input.annotationId, input.articleId),
  );
}

function deleteArticleLibraryReferences(executor: ReadingMemorySqliteExecutor, articleId: string) {
  executor
    .prepare("DELETE FROM collection_members WHERE member_kind = 'article' AND member_id = ?")
    .run(articleId);
  executor
    .prepare("DELETE FROM library_pins WHERE target_kind = 'article' AND target_id = ?")
    .run(articleId);
}

function sqlPlaceholders(values: unknown[]) {
  return values.map(() => '?').join(', ');
}

function runChanges(result: unknown) {
  const changes = recordField(result, 'changes');
  return typeof changes === 'number' ? changes : 0;
}
