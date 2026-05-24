import { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import { runSourceAgentReviewRequest } from './app-source-agent-review-request';
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
  getArticleText?: () => Promise<string> | string;
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
  setStatusMessage?: (message: string) => void;
  userProfile: UserProfile;
};

type RequestAgentCommentOptions = {
  instruction?: string;
  readingIntent?: Annotation['readingIntent'];
  pendingAnnotationId?: string;
};

export function useSourceReaderSession({
  agents,
  annotations: articleAnnotations,
  article,
  clearPendingOnArticleChange = false,
  clearPendingOnDeleteAnnotation = false,
  ignoreStaleArticleUpdates = false,
  getArticleText,
  onAgentCommentMentioned,
  onAnnotationsApplied,
  onAnnotationsSaved,
  onBeforeDeleteAnnotation,
  onOpenAnnotation,
  onSaveArticle,
  setStatusMessage,
  userProfile,
}: UseSourceReaderSessionOptions) {
  const annotationAgents = useMemo(() => publicAnnotationAgents(agents), [agents]);
  const reviewAgents = useMemo(() => publicReviewAgents(agents), [agents]);
  const pendingAgents = usePendingAnnotationAgents();
  const { clearAllPendingAnnotationAgents, clearPendingAnnotationAgents } = pendingAgents;
  const requestAgentCommentRef = useRef<
    (
      agent: PublicAgent,
      annotation: Annotation,
      userComment: AnnotationComment,
      reviewTargetCommentId?: string,
      options?: RequestAgentCommentOptions,
    ) => Promise<void>
  >(async () => undefined);
  const canRunAgentActions = Boolean(getArticleText && setStatusMessage);

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
      if (onAgentCommentMentioned) {
        for (const agent of mentionedAgents) onAgentCommentMentioned(agent, annotation, comment);
        return;
      }
      if (!canRunAgentActions) return;
      for (const agent of mentionedAgents) {
        void requestAgentCommentRef.current(agent, annotation, comment);
      }
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

  const requestAgentComment = useCallback(
    async (
      agent: PublicAgent,
      annotation: Annotation,
      userComment: AnnotationComment,
      reviewTargetCommentId?: string,
      options: RequestAgentCommentOptions = {},
    ) => {
      const desktop = window.yomitomoDesktop;
      const currentArticle = sourceAnnotations.latestArticleRef.current;
      if (!desktop || !currentArticle || !getArticleText || !setStatusMessage) {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
        return;
      }

      try {
        await runSourceAgentCommentRequest({
          agent,
          annotation,
          userComment,
          instruction: options.instruction,
          readingIntent: options.readingIntent,
          desktop,
          currentArticle,
          articleText: await getArticleText(),
          reviewTargetCommentId,
          annotationsRef: sourceAnnotations.annotationsRef,
          applyAnnotations: sourceAnnotations.applyAnnotations,
          saveAnnotations: sourceAnnotations.saveAnnotations,
          setStatusMessage,
        });
      } finally {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
      }
    },
    [
      getArticleText,
      pendingAgents,
      setStatusMessage,
      sourceAnnotations.annotationsRef,
      sourceAnnotations.applyAnnotations,
      sourceAnnotations.latestArticleRef,
      sourceAnnotations.saveAnnotations,
    ],
  );
  requestAgentCommentRef.current = requestAgentComment;

  const requestAnnotationReview = useCallback(
    async (annotationId: string, selectedAgents: PublicAgent[]) => {
      const desktop = window.yomitomoDesktop;
      const currentArticle = sourceAnnotations.latestArticleRef.current;
      const currentAnnotation = sourceAnnotations.annotationsRef.current.find(
        (annotation) => annotation.id === annotationId,
      );
      if (
        !desktop ||
        !currentArticle ||
        !currentAnnotation ||
        selectedAgents.length === 0 ||
        !getArticleText ||
        !setStatusMessage
      ) {
        return;
      }

      await runSourceAgentReviewRequest({
        agents: selectedAgents,
        annotation: currentAnnotation,
        desktop,
        currentArticle,
        articleText: await getArticleText(),
        annotationsRef: sourceAnnotations.annotationsRef,
        applyAnnotations: sourceAnnotations.applyAnnotations,
        saveAnnotations: sourceAnnotations.saveAnnotations,
        setStatusMessage,
      });
    },
    [
      getArticleText,
      setStatusMessage,
      sourceAnnotations.annotationsRef,
      sourceAnnotations.applyAnnotations,
      sourceAnnotations.latestArticleRef,
      sourceAnnotations.saveAnnotations,
    ],
  );

  return {
    annotationAgents,
    reviewAgents,
    requestAgentComment,
    requestAnnotationReview,
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
