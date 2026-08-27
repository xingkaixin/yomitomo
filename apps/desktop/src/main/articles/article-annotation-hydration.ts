import { inArray } from 'drizzle-orm';
import type { Annotation, AnnotationAuthorRef, Comment } from '@yomitomo/shared';
import { uniqueNonEmptyStrings } from '@yomitomo/shared';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';
import { rowToAnnotation, rowToComment, sortByCreatedAt } from '../store/store-normalizers';

export function readArticleAnnotations(database: StoreExecutor, articleId: string) {
  const annotationRows = readAnnotationRowsForArticles(database, [articleId]);
  const annotationIds = annotationRows.map((row) => row.id);
  const commentRows = readCommentRowsForAnnotations(database, annotationIds);
  const actorAvatars = readAnnotationActorAvatars(database, annotationRows, commentRows);
  return sortByCreatedAt(
    groupAnnotationsByArticle(annotationRows, commentRows, actorAvatars).get(articleId) || [],
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
  actorAvatars: AnnotationActorAvatars,
) {
  const commentsByAnnotation = new Map<string, Comment[]>();
  for (const row of commentRows) {
    const list = commentsByAnnotation.get(row.annotationId) || [];
    list.push(hydrateCommentAvatar(rowToComment(row), actorAvatars));
    commentsByAnnotation.set(row.annotationId, list);
  }

  const annotationsByArticle = new Map<string, Annotation[]>();
  for (const row of annotationRows) {
    const list = annotationsByArticle.get(row.articleId) || [];
    list.push(
      hydrateAnnotationAvatar(
        rowToAnnotation(row, sortByCreatedAt(commentsByAnnotation.get(row.id) || [])),
        actorAvatars,
      ),
    );
    annotationsByArticle.set(row.articleId, list);
  }
  return annotationsByArticle;
}

type AnnotationActorAvatars = {
  agentAvatars: Map<string, string>;
  userAvatars: Map<string, string>;
  defaultUserAvatar?: string;
};

export function readAnnotationActorAvatars(
  database: StoreExecutor,
  annotationRows: Array<typeof schema.annotations.$inferSelect>,
  commentRows: Array<typeof schema.comments.$inferSelect>,
): AnnotationActorAvatars {
  if (annotationRows.length === 0 && commentRows.length === 0) {
    return { agentAvatars: new Map(), userAvatars: new Map() };
  }

  const agentIds = uniqueNonEmptyStrings(
    annotationRows.map((row) => row.agentId).concat(commentRows.map((row) => row.agentId)),
  );
  const userIds = uniqueNonEmptyStrings(
    annotationRows.map((row) => row.userId).concat(commentRows.map((row) => row.userId)),
  );
  const agentRows =
    agentIds.length > 0
      ? database
          .select({ id: schema.agents.id, avatar: schema.agents.avatar })
          .from(schema.agents)
          .where(inArray(schema.agents.id, agentIds))
          .all()
      : [];
  const userRows =
    userIds.length > 0
      ? database
          .select({ id: schema.userProfiles.id, avatar: schema.userProfiles.avatar })
          .from(schema.userProfiles)
          .where(inArray(schema.userProfiles.id, userIds))
          .all()
      : [];
  const defaultUserAvatar =
    database.select({ avatar: schema.userProfiles.avatar }).from(schema.userProfiles).limit(1).get()
      ?.avatar || undefined;
  return {
    agentAvatars: new Map(agentRows.map((row) => [row.id, row.avatar])),
    userAvatars: new Map(userRows.map((row) => [row.id, row.avatar])),
    defaultUserAvatar,
  };
}

function hydrateAnnotationAvatar(
  annotation: Annotation,
  actorAvatars: AnnotationActorAvatars,
): Annotation {
  return { ...annotation, author: hydrateAuthorAvatar(annotation.author, actorAvatars) };
}

function hydrateCommentAvatar(comment: Comment, actorAvatars: AnnotationActorAvatars): Comment {
  return { ...comment, author: hydrateAuthorAvatar(comment.author, actorAvatars) };
}

function hydrateAuthorAvatar(
  author: AnnotationAuthorRef,
  actorAvatars: AnnotationActorAvatars,
): AnnotationAuthorRef {
  if (author.kind === 'agent') {
    return {
      ...author,
      avatar: actorAvatars.agentAvatars.get(author.agentId) ?? author.avatar,
    };
  }
  return {
    ...author,
    avatar:
      (author.userId && actorAvatars.userAvatars.get(author.userId)) ??
      author.avatar ??
      actorAvatars.defaultUserAvatar,
  };
}
