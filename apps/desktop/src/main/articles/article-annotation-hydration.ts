import { inArray } from 'drizzle-orm';
import type { Annotation, Comment } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';
import { rowToAnnotation, rowToComment, sortByCreatedAt } from '../store/store-normalizers';

export function readArticleAnnotations(database: StoreExecutor, articleId: string) {
  const annotationRows = readAnnotationRowsForArticles(database, [articleId]);
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows = readCommentRowsForAnnotations(database, annotationIds);
  return sortByCreatedAt(
    groupAnnotationsByArticle(annotationRows, commentRows).get(articleId) || [],
  );
}

export function readAnnotationRowsForArticles(database: StoreExecutor, articleIds: string[]) {
  return articleIds.length > 0
    ? database
        .select()
        .from(schema.annotations)
        .where(inArray(schema.annotations.articleId, articleIds))
        .all()
    : [];
}

export function readCommentRowsForAnnotations(database: StoreExecutor, annotationIds: string[]) {
  return annotationIds.length > 0
    ? database
        .select()
        .from(schema.comments)
        .where(inArray(schema.comments.annotationId, annotationIds))
        .all()
    : [];
}

export function groupAnnotationsByArticle(
  annotationRows: Array<typeof schema.annotations.$inferSelect>,
  commentRows: Array<typeof schema.comments.$inferSelect>,
) {
  const commentsByAnnotation = new Map<string, Comment[]>();
  for (const row of commentRows) {
    const list = commentsByAnnotation.get(row.annotationId) || [];
    list.push(rowToComment(row));
    commentsByAnnotation.set(row.annotationId, list);
  }

  const annotationsByArticle = new Map<string, Annotation[]>();
  for (const row of annotationRows) {
    const list = annotationsByArticle.get(row.articleId) || [];
    list.push(rowToAnnotation(row, sortByCreatedAt(commentsByAnnotation.get(row.id) || [])));
    annotationsByArticle.set(row.articleId, list);
  }
  return annotationsByArticle;
}
