import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ArticleRecord } from '@yomitomo/shared';
import { logError } from '../app/logger';
import * as schema from '../db/schema';
import { getDatabase, withDatabaseLease } from '../store/store-db';

type CleanupSourceType = Extract<ArticleRecord['sourceType'], 'ebook' | 'pdf'>;
type CleanupTaskExecutor = {
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
  };
};

let recoveryPromise: Promise<void> | undefined;

export function queueArticleSourceCleanup(
  executor: CleanupTaskExecutor,
  articleId: string,
  sourceType: unknown,
) {
  if (!isCleanupSourceType(sourceType)) return;
  executor
    .prepare(
      `
INSERT INTO article_source_cleanup_tasks (article_id, source_type, created_at)
VALUES (?, ?, ?)
ON CONFLICT(article_id) DO UPDATE SET
  source_type = excluded.source_type,
  created_at = excluded.created_at
`,
    )
    .run(articleId, sourceType, new Date().toISOString());
}

export async function completeArticleSourceCleanup(articleId: string) {
  const operationId = randomUUID();
  let sourceType: CleanupSourceType | undefined;
  try {
    await withDatabaseLease(async () => {
      const task = getDatabase()
        .select()
        .from(schema.articleSourceCleanupTasks)
        .where(eq(schema.articleSourceCleanupTasks.articleId, articleId))
        .get();
      if (!task || !isCleanupSourceType(task.sourceType)) return;
      sourceType = task.sourceType;

      await deleteSourceAssets(task.articleId, sourceType);
      getDatabase()
        .delete(schema.articleSourceCleanupTasks)
        .where(eq(schema.articleSourceCleanupTasks.articleId, task.articleId))
        .run();
    });
  } catch (error) {
    logError('article_source.cleanup_deferred', error, {
      articleId,
      operationId,
      phase: 'delete_assets',
      sourceType,
    });
  }
}

export function recoverPendingArticleSourceCleanup() {
  recoveryPromise ||= recoverArticleSourceCleanup();
  return recoveryPromise;
}

export function resetArticleSourceCleanupRecovery() {
  recoveryPromise = undefined;
}

async function recoverArticleSourceCleanup() {
  const pending = getDatabase().select().from(schema.articleSourceCleanupTasks).all();
  for (const task of pending) await completeArticleSourceCleanup(task.articleId);
}

async function deleteSourceAssets(articleId: string, sourceType: CleanupSourceType) {
  if (sourceType === 'ebook') {
    const { deleteEbookSourceFile } = await import('../ebooks/ebook-storage');
    await deleteEbookSourceFile(articleId);
    return;
  }

  const { deletePdfSourceFile } = await import('../pdf/pdf-storage');
  const { deletePdfThumbnail } = await import('../pdf/pdf-thumbnail-storage');
  await deletePdfSourceFile(articleId);
  await deletePdfThumbnail(articleId);
}

function isCleanupSourceType(sourceType: unknown): sourceType is CleanupSourceType {
  return sourceType === 'ebook' || sourceType === 'pdf';
}
