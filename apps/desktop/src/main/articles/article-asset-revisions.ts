import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import type { StoreExecutor } from '../store/store-db';

type CommentAssetFacts = Pick<
  typeof schema.comments.$inferSelect,
  | 'annotationId'
  | 'author'
  | 'content'
  | 'pending'
  | 'userId'
  | 'userUsername'
  | 'agentId'
  | 'agentUsername'
>;

export type StoredCommentAsset = CommentAssetFacts & { id: string; assetRevision: string };
type DistillationAssetFacts = Pick<
  typeof schema.annotations.$inferSelect,
  'distillationStatus' | 'distillationContent'
>;
export type StoredDistillationAsset = DistillationAssetFacts & {
  id: string;
  distillationRevision: string;
};
export type StoredArticleAssetRevisions = {
  annotations: Map<string, StoredDistillationAsset>;
  comments: Map<string, StoredCommentAsset>;
};

export function commentAssetRevision(
  previous: StoredCommentAsset | undefined,
  next: CommentAssetFacts,
) {
  if (
    previous &&
    previous.annotationId === next.annotationId &&
    previous.content === next.content &&
    (previous.pending === true) === (next.pending === true) &&
    previous.author === next.author &&
    authorIdentity(previous) === authorIdentity(next)
  ) {
    return previous.assetRevision;
  }
  return randomUUID();
}

function authorIdentity(facts: CommentAssetFacts) {
  const id = facts.author === 'ai' ? facts.agentId : facts.userId;
  const username = facts.author === 'ai' ? facts.agentUsername : facts.userUsername;
  return id ? `id:${id}` : `username:${username ?? ''}`;
}

export function distillationAssetRevision(
  previous: StoredDistillationAsset | undefined,
  next: DistillationAssetFacts,
) {
  return previous &&
    previous.distillationStatus === next.distillationStatus &&
    previous.distillationContent === next.distillationContent
    ? previous.distillationRevision
    : randomUUID();
}

export function readStoredArticleAssetRevisions(
  database: StoreExecutor,
  articleId: string,
  annotationId?: string,
): StoredArticleAssetRevisions {
  const where = and(
    eq(schema.annotations.articleId, articleId),
    annotationId === undefined ? undefined : eq(schema.annotations.id, annotationId),
  );
  const annotations = database
    .select({
      id: schema.annotations.id,
      distillationStatus: schema.annotations.distillationStatus,
      distillationContent: schema.annotations.distillationContent,
      distillationRevision: schema.annotations.distillationRevision,
    })
    .from(schema.annotations)
    .where(where)
    .all();
  const comments = database
    .select({
      id: schema.comments.id,
      annotationId: schema.comments.annotationId,
      author: schema.comments.author,
      content: schema.comments.content,
      pending: schema.comments.pending,
      userId: schema.comments.userId,
      userUsername: schema.comments.userUsername,
      agentId: schema.comments.agentId,
      agentUsername: schema.comments.agentUsername,
      assetRevision: schema.comments.assetRevision,
    })
    .from(schema.comments)
    .innerJoin(schema.annotations, eq(schema.annotations.id, schema.comments.annotationId))
    .where(where)
    .all();
  return {
    annotations: new Map(annotations.map((row) => [row.id, row])),
    comments: new Map(comments.map((row) => [row.id, row])),
  };
}
