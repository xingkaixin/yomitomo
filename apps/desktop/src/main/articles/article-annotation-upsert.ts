import { eq } from 'drizzle-orm';
import type { Annotation, ArticleUpsertPatch, Comment } from '@yomitomo/shared';
import { mergeAgentAnnotationAsThought } from '@yomitomo/core';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import * as schema from '../db/schema';
import type { StoreDatabase, StoreExecutor } from '../store/store-db';
import type { ReadingMemorySqliteExecutor } from '../reading-memory/reading-memory-store';
import { queueStoredAnnotationThreadProjection } from '../reading-memory/reading-memory-projection-job-queue';
import { trySyncArticleAnnotationMemoryEntries } from './article-annotation-memory';
import {
  annotationToRow,
  commentRowsForAnnotation,
  commentToRow,
  serializeAnnotationDistillationReviewSessions,
} from './article-repository-child-rows';
import { readArticleAnnotations } from './article-annotation-hydration';
import { readArticleSummaryRows } from './article-row-queries';
import { buildArticleUpsertPatch, insertCommentRows, touchArticleRows } from './article-row-writes';
import {
  distillationAssetRevision,
  readStoredArticleAssetRevisions,
  type StoredDistillationAsset,
} from './article-asset-revisions';
import { deleteRemovedAssetReviews } from './article-repository-lifecycle';

export function upsertAnnotationRows(
  database: StoreDatabase,
  input: { articleId: string; annotation: Annotation; updatedAt?: string },
  executor: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  const existingArticleId = readAnnotationArticleId(database, input.annotation.id);
  if (existingArticleId && existingArticleId !== input.articleId) return null;
  const queuedAt = new Date().toISOString();

  database.transaction((tx) => {
    const previous = readStoredArticleAssetRevisions(tx, input.articleId, input.annotation.id);
    upsertAnnotationRow(
      tx,
      input.articleId,
      input.annotation,
      previous.annotations.get(input.annotation.id),
    );
    tx.delete(schema.comments).where(eq(schema.comments.annotationId, input.annotation.id)).run();
    insertCommentRows(tx, commentRowsForAnnotation(input.annotation, previous.comments));
    const currentCommentIds = new Set(input.annotation.comments.map((comment) => comment.id));
    deleteRemovedAssetReviews(executor, {
      articleId: input.articleId,
      commentIds: [...previous.comments.keys()].filter((id) => !currentCommentIds.has(id)),
      distillationAnnotationIds: input.annotation.distillation ? [] : [input.annotation.id],
    });
    touchArticleRows(tx, input.articleId, input.updatedAt || input.annotation.updatedAt);
    queueStoredAnnotationThreadProjection(executor, {
      articleId: input.articleId,
      annotationId: input.annotation.id,
      queuedAt,
    });
  });
  trySyncArticleAnnotationMemoryEntries(
    { id: input.articleId, annotations: [input.annotation] },
    executor,
  );
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export function upsertCommentRows(
  database: StoreDatabase,
  input: { articleId: string; annotationId: string; comment: Comment; updatedAt?: string },
  executor: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  if (readAnnotationArticleId(database, input.annotationId) !== input.articleId) return null;
  const queuedAt = new Date().toISOString();

  database.transaction((tx) => {
    const previous = tx
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, input.comment.id))
      .get();
    const row = commentToRow(input.annotationId, input.comment, previous);
    tx.insert(schema.comments)
      .values(row)
      .onConflictDoUpdate({
        target: schema.comments.id,
        set: row,
      })
      .run();
    touchArticleRows(tx, input.articleId, input.updatedAt || input.comment.createdAt);
    queueStoredAnnotationThreadProjection(executor, {
      articleId: input.articleId,
      annotationId: input.annotationId,
      queuedAt,
    });
  });
  trySyncStoredAnnotationMemoryEntries(database, input.articleId, input.annotationId, executor);
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export function saveAnnotationDistillationRows(
  database: StoreDatabase,
  input: {
    articleId: string;
    annotationId: string;
    distillation: Annotation['distillation'];
    expectedDistillationUpdatedAt: string | null;
    updatedAt?: string;
  },
  executor: ReadingMemorySqliteExecutor,
): ArticleUpsertPatch | null {
  const updatedAt = input.updatedAt || input.distillation?.updatedAt || new Date().toISOString();
  const queuedAt = new Date().toISOString();
  const saved = database.transaction((tx) => {
    const storedAnnotation = tx
      .select()
      .from(schema.annotations)
      .where(eq(schema.annotations.id, input.annotationId))
      .get();
    if (storedAnnotation?.articleId !== input.articleId) return false;
    const storedDistillationUpdatedAt = storedAnnotation.distillationUpdatedAt ?? null;
    if (storedDistillationUpdatedAt !== input.expectedDistillationUpdatedAt) {
      throw new DesktopIpcError(desktopIpcErrorCodes.annotationDistillationConflict, undefined, {
        detail: {
          annotationId: input.annotationId,
          expectedUpdatedAt: input.expectedDistillationUpdatedAt,
          storedUpdatedAt: storedDistillationUpdatedAt,
        },
      });
    }
    const distillation = {
      distillationStatus: input.distillation?.status ?? null,
      distillationContent: input.distillation?.content ?? null,
    };
    tx.update(schema.annotations)
      .set({
        ...distillation,
        distillationRevision: distillationAssetRevision(storedAnnotation, distillation),
        distillationPublishedAt: input.distillation?.publishedAt ?? null,
        distillationUpdatedAt: input.distillation?.updatedAt ?? null,
        distillationReviewSessions:
          serializeAnnotationDistillationReviewSessions(input.distillation?.reviewSessions) ?? null,
        updatedAt,
      })
      .where(eq(schema.annotations.id, input.annotationId))
      .run();
    if (!input.distillation) {
      deleteRemovedAssetReviews(executor, {
        articleId: input.articleId,
        distillationAnnotationIds: [input.annotationId],
      });
    }
    touchArticleRows(tx, input.articleId, updatedAt);
    queueStoredAnnotationThreadProjection(executor, {
      articleId: input.articleId,
      annotationId: input.annotationId,
      queuedAt,
    });
    return true;
  });
  if (!saved) return null;
  const article = readArticleSummaryRows(database, input.articleId);
  return article ? buildArticleUpsertPatch(article) : null;
}

export function mergeAgentAnnotationRows(
  database: StoreDatabase,
  input: { articleId: string; annotation: Annotation },
  executor: ReadingMemorySqliteExecutor,
) {
  const annotations = readArticleAnnotations(database, input.articleId);
  const result = mergeAgentAnnotationAsThought(annotations, input.annotation);
  if (result.annotations === annotations) {
    const article = readArticleSummaryRows(database, input.articleId);
    return article ? { activeId: result.activeId, patch: buildArticleUpsertPatch(article) } : null;
  }

  const annotation = result.annotations.find((item) => item.id === result.activeId);
  if (!annotation) return null;
  const patch = upsertAnnotationRows(
    database,
    { articleId: input.articleId, annotation, updatedAt: annotation.updatedAt },
    executor,
  );
  return patch ? { activeId: result.activeId, patch } : null;
}

function upsertAnnotationRow(
  database: StoreExecutor,
  articleId: string,
  annotation: Annotation,
  previous?: StoredDistillationAsset,
) {
  const row = annotationToRow(articleId, annotation, previous);
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

function trySyncStoredAnnotationMemoryEntries(
  database: StoreExecutor,
  articleId: string,
  annotationId: string,
  executor: ReadingMemorySqliteExecutor,
) {
  try {
    const annotation = readArticleAnnotations(database, articleId).find(
      (item) => item.id === annotationId,
    );
    if (annotation) {
      trySyncArticleAnnotationMemoryEntries({ id: articleId, annotations: [annotation] }, executor);
    }
  } catch (error) {
    console.warn('[reading-memory] sync annotation memory entries failed', {
      articleId,
      annotationId,
      error,
    });
  }
}
