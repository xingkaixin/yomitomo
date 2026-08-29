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

export function projectReadingEvidenceThread(input: {
  articleId: string;
  annotation: Annotation;
  sourceVersion: string;
  projectorVersion: string;
}): ProjectedReadingEvidenceEntry[] {
  const activeComments = input.annotation.comments.filter(isProjectableComment);
  const hasUserComment = activeComments.some(isUserComment);
  const projectableComments = hasUserComment ? activeComments : [];
  const publishedDistillation = publishedDistillationContent(input.annotation);
  const entries: ProjectedReadingEvidenceEntry[] = [];

  if (
    input.annotation.anchor.exact.trim() &&
    isProjectableAnnotation(input.annotation, hasUserComment, publishedDistillation)
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

  for (const comment of projectableComments) {
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

  if (publishedDistillation) {
    const { createdAt, updatedAt } = distillationTimestamps(input.annotation);
    entries.push({
      id: `reading_evidence_distillation:${input.annotation.id}`,
      assetType: 'distillation',
      sourceVersion: input.sourceVersion,
      projectorVersion: input.projectorVersion,
      isJudgment: true,
      isUserAuthored: false,
      searchText: searchableText(publishedDistillation, input.annotation.anchor.exact),
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
    const activeComments = annotation.comments.filter(isProjectableComment);
    if (
      projected.id !== `reading_evidence_annotation:${annotation.id}` ||
      !content ||
      !isProjectableAnnotation(
        annotation,
        activeComments.some(isUserComment),
        publishedDistillationContent(annotation),
      )
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
    const comment = annotation.comments.find((item) => item.id === projected.sourceCommentId);
    if (
      !comment ||
      projected.id !== `reading_evidence_comment:${comment.id}` ||
      !isProjectableComment(comment) ||
      !annotation.comments.some((item) => isProjectableComment(item) && isUserComment(item))
    ) {
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

  const content = publishedDistillationContent(annotation);
  if (projected.id !== `reading_evidence_distillation:${annotation.id}` || !content) return null;
  const { createdAt, updatedAt } = distillationTimestamps(annotation);
  return {
    ...base,
    content,
    createdAt,
    updatedAt,
  };
}

function isProjectableComment(comment: Comment) {
  return comment.pending !== true && comment.content.trim().length > 0;
}

function isUserComment(comment: Comment) {
  return comment.author.kind === 'user';
}

function isProjectableAnnotation(
  annotation: Annotation,
  hasUserComment: boolean,
  publishedDistillation: string,
) {
  return annotation.author.kind === 'user' || hasUserComment || Boolean(publishedDistillation);
}

function publishedDistillationContent(annotation: Annotation) {
  if (annotation.distillation?.status !== 'published') return '';
  return annotation.distillation.content.trim();
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
