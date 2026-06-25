import {
  deleteReadingMemoryForArticle,
  softDeleteReadingMemoryEntriesBySource,
  withReadingMemoryTransaction,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';

export function deleteArticleRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
) {
  withReadingMemoryTransaction(executor, () => {
    deleteReadingMemoryForArticle(articleId, executor, { useTransaction: false });
    deleteArticleLibraryReferences(executor, articleId);
    executor.prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  });
  return { articleId };
}

export function deleteAnnotationRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string },
) {
  return withReadingMemoryTransaction(executor, () => {
    const deletedMemoryCount = softDeleteAnnotationMemoryEntries(executor, {
      articleId: input.articleId,
      annotationId: input.annotationId,
      deletedAt: input.deletedAt,
      useTransaction: false,
    });
    const deletedAnnotationCount = runChanges(
      executor
        .prepare('DELETE FROM annotations WHERE article_id = ? AND id = ?')
        .run(input.articleId, input.annotationId),
    );
    return { deletedAnnotationCount, deletedMemoryCount };
  });
}

export function deleteCommentRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; commentId: string; deletedAt?: string },
) {
  return withReadingMemoryTransaction(executor, () => {
    const commentIds = deletedCommentThreadIds(executor, input.annotationId, input.commentId);
    const deletedMemoryCount = softDeleteCommentMemoryEntries(executor, {
      articleId: input.articleId,
      commentIds,
      deletedAt: input.deletedAt,
      useTransaction: false,
    });
    const deletedCommentCount = deleteCommentsByIds(executor, {
      articleId: input.articleId,
      annotationId: input.annotationId,
      commentIds,
    });

    return { deletedCommentCount, deletedMemoryCount };
  });
}

export function softDeleteAnnotationMemoryEntries(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string; useTransaction?: boolean },
) {
  return softDeleteReadingMemoryEntriesBySource({
    articleId: input.articleId,
    sourceAnnotationId: input.annotationId,
    deletedAt: input.deletedAt,
    deletionReason: 'annotation_deleted',
    executor,
    useTransaction: input.useTransaction,
  });
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

  const run = () => {
    const deletedAt = input.deletedAt || new Date().toISOString();
    const placeholders = sqlPlaceholders(input.commentIds);
    const ids = executor
      .prepare(
        `
SELECT id
FROM reading_memory_entries
WHERE article_id = ?
  AND deleted_at IS NULL
  AND source_comment_id IN (${placeholders})
`,
      )
      .all(input.articleId, ...input.commentIds)
      .map((row) => stringField(recordField(row, 'id')))
      .filter(Boolean);
    if (ids.length === 0) return 0;

    executor
      .prepare(
        `
UPDATE reading_memory_entries
SET deleted_at = ?, deletion_reason = 'comment_deleted', updated_at = ?
WHERE article_id = ?
  AND deleted_at IS NULL
  AND source_comment_id IN (${placeholders})
`,
      )
      .run(deletedAt, deletedAt, input.articleId, ...input.commentIds);
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

function recordField(input: unknown, field: string): unknown {
  return isRecord(input) ? input[field] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function runChanges(result: unknown) {
  const changes = recordField(result, 'changes');
  return typeof changes === 'number' ? changes : 0;
}
