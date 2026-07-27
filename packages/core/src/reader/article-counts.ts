import type {
  Annotation,
  ArticleCounts,
  ArticleRecord,
  ArticleSummaryRecord,
} from '@yomitomo/shared';
import { annotationThoughtComments, annotationThreadComments } from './annotations';
import { annotationHasPublishedDistillation } from './reader-annotations';

type ArticleCountSource = Pick<ArticleRecord, 'annotations'> | Pick<ArticleSummaryRecord, 'counts'>;

export function articleCounts(source: ArticleCountSource): ArticleCounts {
  if ('counts' in source) return source.counts;

  return {
    annotationCount: source.annotations.length,
    thoughtCount: source.annotations.reduce(
      (count, annotation) => count + annotationThoughtComments(annotation).length,
      0,
    ),
    discussionCommentCount: source.annotations.reduce(
      (count, annotation) => count + annotationThreadComments(annotation).length,
      0,
    ),
    aiCommentCount: source.annotations.reduce(
      (count, annotation) => count + annotationAiContributionDates(annotation).length,
      0,
    ),
    distillationCount: source.annotations.filter(annotationHasPublishedDistillation).length,
  };
}

export function annotationAiContributionDates(annotation: Annotation) {
  const dates: string[] = [];
  const seenCommentIds = new Set<string>();
  for (const comment of [
    ...annotationThreadComments(annotation),
    ...annotationThoughtComments(annotation),
  ]) {
    if (comment.author.kind !== 'agent' || seenCommentIds.has(comment.id)) continue;
    seenCommentIds.add(comment.id);
    dates.push(comment.createdAt);
  }
  for (const session of annotation.distillation?.reviewSessions || []) {
    for (const message of session.messages) {
      if (message.author === 'ai') dates.push(message.createdAt);
    }
  }
  return dates;
}
