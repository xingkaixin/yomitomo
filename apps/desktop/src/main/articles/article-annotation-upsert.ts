import { eq } from 'drizzle-orm';
import type { Annotation, ArticleUpsertPatch, Comment } from '@yomitomo/shared';
import { readingMemoryEntriesFromAnnotationThread } from '@yomitomo/core';
import * as schema from '../db/schema';
import { getSqliteExecutor, type StoreDatabase, type StoreExecutor } from '../store/store-db';
import {
  upsertReadingMemoryEntries,
  type ReadingMemorySqliteExecutor,
} from '../reading-memory/reading-memory-store';
import {
  annotationToRow,
  commentRowsForAnnotation,
  commentToRow,
} from './article-repository-child-rows';
import { readArticleAnnotations } from './article-annotation-hydration';
import { readArticleSummaryRows } from './article-row-queries';
import { buildArticleUpsertPatch, insertCommentRows, touchArticleRows } from './article-row-writes';

export function upsertAnnotationRows(
  database: StoreDatabase,
  input: { articleId: string; annotation: Annotation; updatedAt?: string },
  executor?: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  const existingArticleId = readAnnotationArticleId(database, input.annotation.id);
  if (existingArticleId && existingArticleId !== input.articleId) return null;

  database.transaction((tx) => {
    upsertAnnotationRow(tx, input.articleId, input.annotation);
    tx.delete(schema.comments).where(eq(schema.comments.annotationId, input.annotation.id)).run();
    insertCommentRows(tx, commentRowsForAnnotation(input.annotation));
    touchArticleRows(tx, input.articleId, input.updatedAt || input.annotation.updatedAt);
  });
  syncAnnotationMemoryEntries(input.articleId, input.annotation, executor);
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export function upsertCommentRows(
  database: StoreDatabase,
  input: { articleId: string; annotationId: string; comment: Comment; updatedAt?: string },
  executor?: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  if (readAnnotationArticleId(database, input.annotationId) !== input.articleId) return null;

  database.transaction((tx) => {
    tx.insert(schema.comments)
      .values(commentToRow(input.annotationId, input.comment))
      .onConflictDoUpdate({
        target: schema.comments.id,
        set: commentToRow(input.annotationId, input.comment),
      })
      .run();
    touchArticleRows(tx, input.articleId, input.updatedAt || input.comment.createdAt);
  });
  syncStoredAnnotationMemoryEntries(database, input.articleId, input.annotationId, executor);
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

function upsertAnnotationRow(database: StoreExecutor, articleId: string, annotation: Annotation) {
  const row = annotationToRow(articleId, annotation);
  database
    .insert(schema.annotations)
    .values(row)
    .onConflictDoUpdate({
      target: schema.annotations.id,
      set: row,
    })
    .run();
}

function readAnnotationArticleId(database: StoreDatabase, annotationId: string) {
  return (
    database.select().from(schema.annotations).where(eq(schema.annotations.id, annotationId)).get()
      ?.articleId || null
  );
}

function syncStoredAnnotationMemoryEntries(
  database: StoreDatabase,
  articleId: string,
  annotationId: string,
  executor?: ReadingMemorySqliteExecutor,
) {
  const annotation = readArticleAnnotations(database, articleId).find(
    (item) => item.id === annotationId,
  );
  if (annotation) syncAnnotationMemoryEntries(articleId, annotation, executor);
}

function syncAnnotationMemoryEntries(
  articleId: string,
  annotation: Annotation,
  executor?: ReadingMemorySqliteExecutor,
) {
  upsertReadingMemoryEntries(
    readingMemoryEntriesFromAnnotationThread({ articleId, annotation }),
    executor || (getSqliteExecutor() as unknown as ReadingMemorySqliteExecutor),
  );
}
