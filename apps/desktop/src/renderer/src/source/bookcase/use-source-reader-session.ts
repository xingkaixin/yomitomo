import { useCallback, useEffect, useMemo, useRef } from 'react';
import type {
  Agent,
  AgentReadingPlanItem,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  PublicAgent,
  ReadingMemory,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { resolveTextAnchor } from '@yomitomo/shared';
import type { PromptArticle } from '../../shell/app-reading-types';
import { publicAnnotationAgents, publicReviewAgents } from './app-source-bookcase-shared';
import {
  createPendingAgentAnnotation,
  prepareSourceAgentAnnotationRequestInput,
  runSourceAgentAnnotationRequest,
  type SourceAgentAnnotationRequestInput,
  type SourceAgentAnnotationRequestOptions,
  withoutAnnotationId,
} from './app-source-agent-request';
import { runSourceAgentCommentRequest } from './app-source-agent-comment-request';
import { runSourceAgentReviewRequest } from './app-source-agent-review-request';
import { usePendingAnnotationAgents } from '../../shell/use-pending-annotation-agents';
import { useSourceAnnotations } from './use-source-annotations';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

type UseSourceReaderSessionOptions = {
  agents: Agent[];
  agentAnnotationAdapter?: SourceAgentAnnotationAdapter;
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
  onDeleteArticleAnnotation?: (articleId: string, annotationId: string) => Promise<void> | void;
  onDeleteArticleComment?: (
    articleId: string,
    annotationId: string,
    commentId: string,
  ) => Promise<void> | void;
  onOpenAnnotation?: (annotationId: string) => void;
  onSaveArticle: (article: ArticleRecord) => Promise<void> | void;
  onSaveArticleAnnotation?: (
    articleId: string,
    annotation: Annotation,
    updatedAt?: string,
  ) => Promise<void> | void;
  onSaveArticleComment?: (
    articleId: string,
    annotationId: string,
    comment: AnnotationComment,
    updatedAt?: string,
  ) => Promise<void> | void;
  setStatusMessage?: (message: string) => void;
  uiLanguage?: UiLanguage;
  userProfile: UserProfile;
};

export type SourceAgentAnnotationContext<TSource = any> = {
  article: PromptArticle;
  articleId: string;
  articleScopedWrite?: boolean;
  articleText: string;
  readingMemory?: ReadingMemory;
  showProgress?: boolean;
  source?: TSource;
  visibleArticle?: boolean;
};

export type SourceAgentAnnotationAdapter<TSource = any, TPlayback = any> = {
  getContext: (args: {
    agent: PublicAgent;
    currentArticle: ArticleRecord;
    options: SourceAgentAnnotationRequestOptions;
  }) =>
    | Promise<SourceAgentAnnotationContext<TSource> | null>
    | SourceAgentAnnotationContext<TSource>
    | null;
  resolveOptions?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
  }) => SourceAgentAnnotationRequestOptions;
  isBusy?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
  }) => boolean;
  start?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    requestInput: SourceAgentAnnotationRequestInput;
  }) => Promise<TPlayback> | TPlayback;
  onPendingAnnotationCreated?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    pendingAnnotation: Annotation;
    playback: TPlayback | undefined;
  }) => void;
  onPendingAnnotationRemoved?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    pendingAnnotation: Annotation;
    playback: TPlayback | undefined;
  }) => void;
  onAnnotation: (args: {
    agent: PublicAgent;
    annotation: Annotation;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    playback: TPlayback | undefined;
    requestInput: SourceAgentAnnotationRequestInput;
  }) => Promise<boolean> | boolean;
  onReadingMemory?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    readingMemory: ReadingMemory | undefined;
  }) => Promise<void> | void;
  onEmpty?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    playback: TPlayback | undefined;
    requestInput: SourceAgentAnnotationRequestInput;
  }) => Promise<void> | void;
  onSuccess?: (args: {
    agent: PublicAgent;
    annotationCount: number;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    playback: TPlayback | undefined;
    requestInput: SourceAgentAnnotationRequestInput;
  }) => Promise<void> | void;
  finish?: (args: {
    agent: PublicAgent;
    context: SourceAgentAnnotationContext<TSource>;
    options: SourceAgentAnnotationRequestOptions;
    playback: TPlayback | undefined;
    requestFailed: boolean;
    requestInput?: SourceAgentAnnotationRequestInput;
  }) => Promise<void> | void;
};

type RequestAgentCommentOptions = {
  instruction?: string;
  readingIntent?: Annotation['readingIntent'];
  pendingAnnotationId?: string;
};

export function useSourceReaderSession({
  agents,
  agentAnnotationAdapter,
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
  onDeleteArticleAnnotation,
  onDeleteArticleComment,
  onOpenAnnotation,
  onSaveArticle,
  onSaveArticleAnnotation,
  onSaveArticleComment,
  setStatusMessage,
  uiLanguage,
  userProfile,
}: UseSourceReaderSessionOptions) {
  const annotationAgents = useMemo(
    () => publicAnnotationAgents(agents, uiLanguage),
    [agents, uiLanguage],
  );
  const reviewAgents = useMemo(() => publicReviewAgents(agents, uiLanguage), [agents, uiLanguage]);
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
    onDeleteArticleAnnotation,
    onDeleteArticleComment,
    onSaveArticle,
    onSaveArticleAnnotation,
    onSaveArticleComment,
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
          uiLanguage,
          annotationsRef: sourceAnnotations.annotationsRef,
          applyAnnotations: sourceAnnotations.applyAnnotations,
          saveComment: sourceAnnotations.saveComment,
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
      sourceAnnotations.saveComment,
      uiLanguage,
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
        uiLanguage,
        annotationsRef: sourceAnnotations.annotationsRef,
        applyAnnotations: sourceAnnotations.applyAnnotations,
        saveComment: sourceAnnotations.saveComment,
        setStatusMessage,
      });
    },
    [
      getArticleText,
      setStatusMessage,
      sourceAnnotations.annotationsRef,
      sourceAnnotations.applyAnnotations,
      sourceAnnotations.latestArticleRef,
      sourceAnnotations.saveComment,
      uiLanguage,
    ],
  );

  const requestAgentAnnotations = useCallback(
    async (agent: PublicAgent, options: SourceAgentAnnotationRequestOptions = {}) => {
      const desktop = window.yomitomoDesktop;
      const currentArticle = sourceAnnotations.latestArticleRef.current;
      if (!desktop || !currentArticle || !agentAnnotationAdapter) {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
        return;
      }

      const context = await agentAnnotationAdapter.getContext({
        agent,
        currentArticle,
        options,
      });
      if (!context) {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
        return;
      }
      if (agentAnnotationAdapter.isBusy?.({ agent, context, options })) {
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
        return;
      }
      const requestOptions =
        agentAnnotationAdapter.resolveOptions?.({ agent, context, options }) ?? options;

      const requestInput = await prepareSourceAgentAnnotationRequestInput({
        desktop,
        agent,
        agents: annotationAgents,
        options: requestOptions,
        context: {
          article: context.article,
          annotations: sourceAnnotations.annotationsRef.current,
          readingMemory: context.readingMemory ?? currentArticle.focusCoReadingPlan?.readingMemory,
          uiLanguage,
        },
      });
      const playback = await agentAnnotationAdapter.start?.({
        agent,
        context,
        options: requestOptions,
        requestInput,
      });
      let pendingAnnotation: Annotation | null = null;
      const removePendingAnnotation = () => {
        if (!pendingAnnotation) return;
        sourceAnnotations.applyAnnotations(
          withoutAnnotationId(sourceAnnotations.annotationsRef.current, pendingAnnotation.id),
        );
        agentAnnotationAdapter.onPendingAnnotationRemoved?.({
          agent,
          context,
          options: requestOptions,
          pendingAnnotation,
          playback,
        });
        pendingAnnotation = null;
      };

      if (
        context.showProgress !== false &&
        context.visibleArticle !== false &&
        requestOptions.targetAnchor &&
        !requestOptions.pendingAnnotationId
      ) {
        pendingAnnotation = createPendingAgentAnnotation(
          agent,
          requestOptions.targetAnchor,
          requestOptions.readingIntent,
        );
        sourceAnnotations.applyAnnotations([
          ...sourceAnnotations.annotationsRef.current,
          pendingAnnotation,
        ]);
        onOpenAnnotation?.(pendingAnnotation.id);
        agentAnnotationAdapter.onPendingAnnotationCreated?.({
          agent,
          context,
          options: requestOptions,
          pendingAnnotation,
          playback,
        });
      }

      let requestFailed = true;
      try {
        const { result, annotationCount } = await runSourceAgentAnnotationRequest({
          desktop,
          requestInput,
          onAnnotation: (annotation) => {
            removePendingAnnotation();
            return agentAnnotationAdapter.onAnnotation({
              agent,
              annotation,
              context,
              options: requestOptions,
              playback,
              requestInput,
            });
          },
        });
        if (requestInput.shouldSaveReadingMemory) {
          await agentAnnotationAdapter.onReadingMemory?.({
            agent,
            context,
            options: requestOptions,
            readingMemory: result.readingMemory,
          });
        }
        if (annotationCount === 0) {
          await agentAnnotationAdapter.onEmpty?.({
            agent,
            context,
            options: requestOptions,
            playback,
            requestInput,
          });
          requestFailed = false;
          return;
        }
        await agentAnnotationAdapter.onSuccess?.({
          agent,
          annotationCount,
          context,
          options: requestOptions,
          playback,
          requestInput,
        });
        requestFailed = false;
      } finally {
        removePendingAnnotation();
        await agentAnnotationAdapter.finish?.({
          agent,
          context,
          options: requestOptions,
          playback,
          requestFailed,
          requestInput,
        });
        if (options.pendingAnnotationId) {
          pendingAgents.removePendingAnnotationAgent(options.pendingAnnotationId, agent.id);
        }
      }
    },
    [
      agentAnnotationAdapter,
      annotationAgents,
      onOpenAnnotation,
      pendingAgents,
      sourceAnnotations.annotationsRef,
      sourceAnnotations.applyAnnotations,
      sourceAnnotations.latestArticleRef,
      uiLanguage,
    ],
  );

  return {
    annotationAgents,
    reviewAgents,
    requestAgentComment,
    requestAgentAnnotations,
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
