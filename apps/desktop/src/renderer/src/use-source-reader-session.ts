import { useEffect, useMemo } from 'react';
import type {
  Agent,
  AgentReadingPlanItem,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UserProfile,
} from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { publicAnnotationAgents, publicReviewAgents } from './app-source-bookcase-shared';
import { usePendingAnnotationAgents } from './use-pending-annotation-agents';
import { useSourceAnnotations } from './use-source-annotations';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

type UseSourceReaderSessionOptions = {
  agents: Agent[];
  annotations: Annotation[];
  article: ArticleRecord;
  clearPendingOnArticleChange?: boolean;
  clearPendingOnDeleteAnnotation?: boolean;
  ignoreStaleArticleUpdates?: boolean;
  onAgentCommentMentioned?: (
    agent: PublicAgent,
    annotation: Annotation,
    comment: AnnotationComment,
  ) => void;
  onAnnotationsApplied?: (change: SourceAnnotationsChange) => void;
  onAnnotationsSaved?: (change: SourceAnnotationsChange) => void;
  onBeforeDeleteAnnotation?: (annotationId: string) => void;
  onOpenAnnotation?: (annotationId: string) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  userProfile: UserProfile;
};

export function useSourceReaderSession({
  agents,
  annotations: articleAnnotations,
  article,
  clearPendingOnArticleChange = false,
  clearPendingOnDeleteAnnotation = false,
  ignoreStaleArticleUpdates = false,
  onAgentCommentMentioned,
  onAnnotationsApplied,
  onAnnotationsSaved,
  onBeforeDeleteAnnotation,
  onOpenAnnotation,
  onSaveArticle,
  userProfile,
}: UseSourceReaderSessionOptions) {
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const reviewAgents = useMemo(() => publicReviewAgents(agents), [agents]);
  const pendingAgents = usePendingAnnotationAgents();
  const { clearAllPendingAnnotationAgents, clearPendingAnnotationAgents } = pendingAgents;

  const sourceAnnotations = useSourceAnnotations({
    annotationAgents,
    annotations: articleAnnotations,
    article,
    ignoreStaleArticleUpdates,
    onBeforeDeleteAnnotation: (annotationId) => {
      onBeforeDeleteAnnotation?.(annotationId);
      if (clearPendingOnDeleteAnnotation) clearPendingAnnotationAgents(annotationId);
    },
    onCommentSaved: ({ annotation, comment, mentionedAgents }) => {
      if (!onAgentCommentMentioned) return;
      for (const agent of mentionedAgents) onAgentCommentMentioned(agent, annotation, comment);
    },
    onOpenAnnotation,
    onSaveArticle,
    onAnnotationsApplied,
    onAnnotationsSaved,
    userProfile,
  });

  useEffect(() => {
    if (clearPendingOnArticleChange) clearAllPendingAnnotationAgents();
  }, [article.id, clearAllPendingAnnotationAgents, clearPendingOnArticleChange]);

  return {
    annotationAgents,
    reviewAgents,
    ...pendingAgents,
    ...sourceAnnotations,
  };
}

export function constrainSourceAgentPlanAnnotation(
  annotation: Annotation,
  readingPlan: AgentReadingPlanItem[] | undefined,
  articleText: string,
) {
  if (!readingPlan?.length) return annotation;

  const position = resolveTextAnchor(articleText, annotation.anchor);
  if (!position) return null;

  const planItem = readingPlan.find(
    (item) => position.start >= item.sectionStart && position.end <= item.sectionEnd,
  );
  if (!planItem) return null;
  if (!planItem.readingIntent) return annotation;
  if (annotation.readingIntent === planItem.readingIntent) return annotation;

  return {
    ...annotation,
    readingIntent: planItem.readingIntent,
    comments: annotation.comments.map((comment) => ({
      ...comment,
      readingIntent: comment.readingIntent || planItem.readingIntent,
    })),
  };
}
