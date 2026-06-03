import {
  deleteReadingMemoryForArticle,
  softDeleteReadingMemoryEntriesBySource,
  withReadingMemoryTransaction,
  type ReadingMemorySqliteExecutor,
} from './reading-memory-store';

export function deleteArticleRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  articleId: string,
) {
  withReadingMemoryTransaction(executor, () => {
    deleteReadingMemoryForArticle(articleId, executor, { useTransaction: false });
    executor.prepare('DELETE FROM articles WHERE id = ?').run(articleId);
  });
  return { articleId };
}

export function deleteAnnotationRowsWithMemoryLifecycle(
  executor: ReadingMemorySqliteExecutor,
  input: { articleId: string; annotationId: string; deletedAt?: string },
) {
  return withReadingMemoryTransaction(executor, () => {
    const deletedMemoryCount = softDeleteReadingMemoryEntriesBySource({
      articleId: input.articleId,
      sourceAnnotationId: input.annotationId,
      deletedAt: input.deletedAt,
      deletionReason: 'annotation_deleted',
      executor,
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
    let deletedMemoryCount = 0;
    let deletedCommentCount = 0;

    for (const commentId of commentIds) {
      deletedMemoryCount += softDeleteReadingMemoryEntriesBySource({
        articleId: input.articleId,
        sourceCommentId: commentId,
        deletedAt: input.deletedAt,
        deletionReason: 'comment_deleted',
        executor,
        useTransaction: false,
      });
      deletedCommentCount += runChanges(
        executor
          .prepare(
            `
DELETE FROM comments
WHERE id = ?
  AND annotation_id = ?
  AND EXISTS (
    SELECT 1 FROM annotations
    WHERE annotations.id = comments.annotation_id
      AND annotations.article_id = ?
  )
`,
          )
          .run(commentId, input.annotationId, input.articleId),
      );
    }

    return { deletedCommentCount, deletedMemoryCount };
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
  const deletedIds = new Set([commentId]);
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const row of rows) {
      const id = stringField(recordField(row, 'id'));
      const replyTo = stringField(recordField(row, 'replyTo'));
      if (!replyTo || !deletedIds.has(replyTo) || deletedIds.has(id)) continue;
      deletedIds.add(id);
      expanded = true;
    }
  }
  return rows
    .map((row) => stringField(recordField(row, 'id')))
    .filter((id) => deletedIds.has(id))
    .toSorted();
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
