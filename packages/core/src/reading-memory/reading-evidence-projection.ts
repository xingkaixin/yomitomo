import type {
  Annotation,
  ArticleSourceType,
  Comment,
  ReadingEvidence,
  ReadingEvidenceAssetType,
} from '@yomitomo/shared';

export type ProjectedReadingEvidenceEntry = {
  id: string;
  assetType: ReadingEvidenceAssetType;
  sourceCommentId?: string;
  sourceVersion: string;
  projectorVersion: string;
  isJudgment: boolean;
  isUserAuthored: boolean;
  searchText: string;
  sourceCreatedAt: string;
  sourceUpdatedAt: string;
};

type JudgmentComment = Pick<Comment, 'content' | 'pending'> & {
  author: Pick<Comment['author'], 'kind'>;
};

export function projectableReadingCommentAuthorKind(comment: JudgmentComment) {
  if (comment.pending === true || comment.content.trim().length === 0) return null;
  return comment.author.kind === 'user' ? ('user' as const) : ('ai' as const);
}

export function selectProjectableReadingJudgments<T extends JudgmentComment>(thread: {
  comments: readonly T[];
  distillation?: Pick<NonNullable<Annotation['distillation']>, 'status' | 'content'>;
}) {
  const activeComments = thread.comments.filter(
    (comment) => projectableReadingCommentAuthorKind(comment) !== null,
  );
  return {
    comments: activeComments.some(isUserComment) ? activeComments : [],
    distillationContent:
      thread.distillation?.status === 'published' ? thread.distillation.content.trim() : '',
  };
}

export function projectReadingEvidenceThread(input: {
  articleId: string;
  annotation: Annotation;
  sourceVersion: string;
  projectorVersion: string;
}): ProjectedReadingEvidenceEntry[] {
  const { comments, distillationContent } = selectProjectableReadingJudgments(input.annotation);
  const entries: ProjectedReadingEvidenceEntry[] = [];

  if (
    input.annotation.anchor.exact.trim() &&
    isProjectableAnnotation(input.annotation, comments.length > 0, distillationContent)
  ) {
    entries.push({
      id: `reading_evidence_annotation:${input.annotation.id}`,
      assetType: 'annotation',
      sourceVersion: input.sourceVersion,
      projectorVersion: input.projectorVersion,
      isJudgment: false,
      isUserAuthored: input.annotation.author.kind === 'user',
      searchText: searchableText(
        input.annotation.anchor.prefix,
        input.annotation.anchor.exact,
        input.annotation.anchor.suffix,
      ),
      sourceCreatedAt: input.annotation.createdAt,
      sourceUpdatedAt: input.annotation.updatedAt,
    });
  }

  for (const comment of comments) {
    entries.push({
      id: `reading_evidence_comment:${comment.id}`,
      assetType: 'comment',
      sourceCommentId: comment.id,
      sourceVersion: input.sourceVersion,
      projectorVersion: input.projectorVersion,
      isJudgment: true,
      isUserAuthored: isUserComment(comment),
      searchText: searchableText(comment.content, input.annotation.anchor.exact),
      sourceCreatedAt: comment.createdAt,
      sourceUpdatedAt: comment.createdAt,
    });
  }

  if (distillationContent) {
    const { createdAt, updatedAt } = distillationTimestamps(input.annotation);
    entries.push({
      id: `reading_evidence_distillation:${input.annotation.id}`,
      assetType: 'distillation',
      sourceVersion: input.sourceVersion,
      projectorVersion: input.projectorVersion,
      isJudgment: true,
      isUserAuthored: false,
      searchText: searchableText(distillationContent, input.annotation.anchor.exact),
      sourceCreatedAt: createdAt,
      sourceUpdatedAt: updatedAt,
    });
  }

  return entries;
}

export function materializeReadingEvidence(input: {
  projected: ProjectedReadingEvidenceEntry;
  annotation: Annotation;
  article: {
    id: string;
    sourceType: ArticleSourceType;
    title: string;
    byline?: string;
  };
}): ReadingEvidence | null {
  const { projected, annotation, article } = input;
  const { comments, distillationContent } = selectProjectableReadingJudgments(annotation);
  const base = {
    id: projected.id,
    assetType: projected.assetType,
    role: projected.assetType === 'annotation' ? ('source' as const) : ('judgment' as const),
    sourceVersion: projected.sourceVersion,
    source: {
      ref: { kind: 'article' as const, id: article.id },
      sourceType: article.sourceType,
      title: article.title,
      ...(article.byline === undefined ? {} : { byline: article.byline }),
    },
    location: {
      annotationId: annotation.id,
      anchor: annotation.anchor,
    },
  };

  if (projected.assetType === 'annotation') {
    const content = annotation.anchor.exact.trim();
    if (
      projected.id !== `reading_evidence_annotation:${annotation.id}` ||
      !content ||
      !isProjectableAnnotation(annotation, comments.length > 0, distillationContent)
    ) {
      return null;
    }
    return {
      ...base,
      content,
      authorKind: authorKind(annotation.author),
      createdAt: annotation.createdAt,
      updatedAt: annotation.updatedAt,
    };
  }

  if (projected.assetType === 'comment') {
    const comment = comments.find((item) => item.id === projected.sourceCommentId);
    if (!comment || projected.id !== `reading_evidence_comment:${comment.id}`) {
      return null;
    }
    return {
      ...base,
      content: comment.content.trim(),
      authorKind: authorKind(comment.author),
      location: { ...base.location, commentId: comment.id },
      createdAt: comment.createdAt,
      updatedAt: comment.createdAt,
    };
  }

  if (projected.id !== `reading_evidence_distillation:${annotation.id}` || !distillationContent) {
    return null;
  }
  const { createdAt, updatedAt } = distillationTimestamps(annotation);
  return {
    ...base,
    content: distillationContent,
    createdAt,
    updatedAt,
  };
}

function isUserComment(comment: JudgmentComment) {
  return comment.author.kind === 'user';
}

function isProjectableAnnotation(
  annotation: Annotation,
  hasUserComment: boolean,
  publishedDistillation: string,
) {
  return annotation.author.kind === 'user' || hasUserComment || Boolean(publishedDistillation);
}

function distillationTimestamps(annotation: Annotation) {
  return {
    createdAt:
      annotation.distillation?.publishedAt ||
      annotation.distillation?.updatedAt ||
      annotation.updatedAt,
    updatedAt:
      annotation.distillation?.updatedAt ||
      annotation.distillation?.publishedAt ||
      annotation.updatedAt,
  };
}

function authorKind(author: Annotation['author']) {
  return author.kind === 'user' ? ('user' as const) : ('ai' as const);
}

function searchableText(...parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .normalize();
}
