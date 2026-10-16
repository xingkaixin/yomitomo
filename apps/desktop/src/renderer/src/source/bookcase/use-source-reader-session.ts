import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  Agent,
  AgentReadingPlanItem,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import { publicAnnotationAgents, publicPersonaAgents } from './source-public-agents';
import type { SourceAgentAnnotationRequestOptions } from './app-source-agent-request';
import { usePendingAnnotationAgents } from '../../shell/use-pending-annotation-agents';
import { useSourceAnnotations } from './use-source-annotations';
import {
  runSourceAgentAnnotationSession,
  type SourceAgentAnnotationAdapter,
} from './source-agent-annotation-session';
import { getDesktopApi } from '../../shell/app-desktop-api';

export type {
  SourceAgentAnnotationAdapter,
  SourceAgentAnnotationContext,
  SourceAgentAnnotationOutcome,
  SourceAgentAnnotationPlayback,
  SourceAgentAnnotationRun,
} from './source-agent-annotation-session';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

export type UseSourceReaderSessionOptions = {
  agents: Agent[];
  agentAnnotationAdapter?: SourceAgentAnnotationAdapter;
  annotations: Annotation[];
  article: ArticleRecord;
  clearPendingOnArticleChange: boolean;
  clearPendingOnDeleteAnnotation: boolean;
  onArticleChange: (article: ArticleRecord) => void;
  onAnnotationsApplied?: (change: SourceAnnotationsChange) => void;
  onAnnotationsSaved?: (change: SourceAnnotationsChange) => void;
  onBeforeDeleteAnnotation?: (annotationId: string) => void;
  onDeleteArticleAnnotation?: (
    articleId: string,
    annotationId: string,
  ) => Promise<string | void> | string | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<string | void> | string | void;
  onOpenAnnotation?: (annotationId: string) => void;
  onSaveArticleAnnotation?: (
    articleId: string,
    annotation: Annotation,
    updatedAt?: string,
  ) => Promise<string | void> | string | void;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: AnnotationComment,
    updatedAt?: string,
  ) => Promise<string | void> | string | void;
  uiLanguage?: UiLanguage;
  userProfile: UserProfile;
};

export function useSourceReaderSession({
  agents,
  agentAnnotationAdapter,
  annotations: articleAnnotations,
  article,
  clearPendingOnArticleChange,
  clearPendingOnDeleteAnnotation,
  onArticleChange,
  onAnnotationsApplied,
  onAnnotationsSaved,
  onBeforeDeleteAnnotation,
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotation,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  uiLanguage,
  userProfile,
}: UseSourceReaderSessionOptions) {
  const agentAnnotationAdapterRef = useRef<SourceAgentAnnotationAdapter | null>(
    agentAnnotationAdapter ?? null,
  );
  useEffect(() => {
    if (!agentAnnotationAdapter) return;
    agentAnnotationAdapterRef.current = agentAnnotationAdapter;
    return () => {
      if (agentAnnotationAdapterRef.current === agentAnnotationAdapter) {
        agentAnnotationAdapterRef.current = null;
      }
    };
  }, [agentAnnotationAdapter]);
  const annotationAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const personaAgents = useMemo(
    () => publicPersonaAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const pendingAgents = usePendingAnnotationAgents();
  const { clearAllPendingAnnotationAgents, clearPendingAnnotationAgents } = pendingAgents;
  const registerAgentAnnotationAdapter = useCallback((adapter: SourceAgentAnnotationAdapter) => {
    agentAnnotationAdapterRef.current = adapter;
    return () => {
      if (agentAnnotationAdapterRef.current === adapter) agentAnnotationAdapterRef.current = null;
    };
  }, []);

  const sourceAnnotations = useSourceAnnotations({
    annotationAgents,
    annotations: articleAnnotations,
    article,
    onArticleChange,
    onBeforeDeleteAnnotation: (annotationId) => {
      onBeforeDeleteAnnotation?.(annotationId);
      if (clearPendingOnDeleteAnnotation) clearPendingAnnotationAgents(annotationId);
    },
    onOpenAnnotation,
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticleAnnotation,
    onSaveArticleComment,
    onAnnotationsApplied,
    onAnnotationsSaved,
    userProfile,
  });

  useEffect(() => {
    if (clearPendingOnArticleChange) clearAllPendingAnnotationAgents();
  }, [article.id, clearAllPendingAnnotationAgents, clearPendingOnArticleChange]);

  const requestAgentAnnotations = useCallback(
    async (agent: PublicAgent, options: SourceAgentAnnotationRequestOptions = {}) => {
      const currentArticle = { ...article, annotations: sourceAnnotations.annotationsRef.current };
      const adapter = agentAnnotationAdapterRef.current;
      if (!adapter) {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
        throw new Error('Source agent annotation adapter is not registered');
      }
      await runSourceAgentAnnotationSession({
        adapter,
        agent,
        annotationAgents,
        currentArticle,
        desktop: getDesktopApi().agent,
        onSettled: options.pendingAnnotationId
          ? () => pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId!, agent.id)
          : undefined,
        options,
        surface: {
          annotations: () => sourceAnnotations.annotationsRef.current,
          applyAnnotations: sourceAnnotations.applyAnnotations,
          openAnnotation: onOpenAnnotation,
        },
        uiLanguage,
      });
    },
    [
      annotationAgents,
      article,
      onOpenAnnotation,
      pendingAgents,
      sourceAnnotations.annotationsRef,
      sourceAnnotations.applyAnnotations,
      uiLanguage,
    ],
  );

  return {
    annotationAgents,
    registerAgentAnnotationAdapter,
    personaAgents,
    requestAgentAnnotations,
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
