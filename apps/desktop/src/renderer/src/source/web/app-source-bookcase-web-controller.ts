import type { Dispatch, SetStateAction } from 'react';
import type {
  AgentReadingPlanItem,
  Annotation,
  ArticleRecord,
  PublicAgent,
} from '@yomitomo/shared';
import { mergeAgentAnnotationAsThought } from '@yomitomo/reader-ui/reader-agent-annotation-playback';
import type { SourceAgentAnnotationPlaybackMode } from '../bookcase/app-source-agent-request';
import {
  articleWithMergedAgentAnnotation,
  promptArticle,
} from '../bookcase/app-source-bookcase-shared';
import {
  constrainSourceAgentPlanAnnotation,
  type SourceAgentAnnotationAdapter,
} from '../bookcase/use-source-reader-session';
import type { ArticleUpdater } from '../../shell/app-reading-types';

type WebSourceReaderControllerOptions = {
  applyAnnotations: (annotations: Annotation[]) => void;
  currentArticleText: () => string;
  enqueueAgentAnnotation: (annotation: Annotation) => void;
  finishVirtualReading: (agentId: string, message: string) => void;
  finishVirtualReadingIfIdle: (agentId: string) => void;
  getAnnotations: () => Annotation[];
  isAgentAnnotating: (agentId: string) => boolean;
  isCurrentArticle: (articleId: string) => boolean;
  markAgentAnnotating: (agentId: string, annotating: boolean) => void;
  markVirtualReadingDone: (agentId: string) => void;
  onOpenAnnotation: (annotationId: string) => void;
  onUpdateArticle: (articleId: string, update: ArticleUpdater) => Promise<void> | void;
  processAgentAnnotationQueue: () => Promise<void> | void;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  startVirtualReading: (
    agent: PublicAgent,
    readingPlan: AgentReadingPlanItem[],
    playbackMode: SourceAgentAnnotationPlaybackMode,
  ) => void;
};

export function createWebSourceReaderController({
  applyAnnotations,
  currentArticleText,
  enqueueAgentAnnotation,
  finishVirtualReading,
  finishVirtualReadingIfIdle,
  getAnnotations,
  isAgentAnnotating,
  isCurrentArticle,
  markAgentAnnotating,
  markVirtualReadingDone,
  onOpenAnnotation,
  onUpdateArticle,
  processAgentAnnotationQueue,
  setStatusMessage,
  startVirtualReading,
}: WebSourceReaderControllerOptions): SourceAgentAnnotationAdapter {
  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let activeId = annotation.id;
    let currentMerge: ReturnType<typeof mergeAgentAnnotationAsThought> | null = null;
    if (isCurrentArticle(articleId)) {
      const result = mergeAgentAnnotationAsThought(getAnnotations(), annotation);
      activeId = result.activeId;
      currentMerge = result;
      applyAnnotations(result.annotations);
      onOpenAnnotation(result.activeId);
    }
    await onUpdateArticle(articleId, (targetArticle: ArticleRecord) => {
      const result = articleWithMergedAgentAnnotation(targetArticle, annotation, currentMerge);
      activeId = result.activeId;
      return result.article;
    });
    return activeId;
  }

  function startAgentAnnotationPlayback(
    agent: PublicAgent,
    readingPlan: AgentReadingPlanItem[],
    playbackMode: SourceAgentAnnotationPlaybackMode,
    showProgress: boolean,
  ) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, true);
    startVirtualReading(agent, readingPlan, playbackMode);
  }

  function handleAgentAnnotationStreamItem(
    articleId: string,
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[],
    articleScopedWrite: boolean,
    articleText: string,
  ) {
    const constrainedAnnotation = constrainSourceAgentPlanAnnotation(
      annotation,
      readingPlan,
      articleText,
    );
    if (!constrainedAnnotation) return false;
    if (articleScopedWrite) {
      void appendAgentAnnotationToArticle(articleId, constrainedAnnotation);
      return true;
    }
    if (!isCurrentArticle(articleId)) return true;
    enqueueAgentAnnotation(constrainedAnnotation);
    void processAgentAnnotationQueue();
    return true;
  }

  function finishEmptyAgentAnnotationPlayback(
    agent: PublicAgent,
    articleId: string,
    showProgress: boolean,
  ) {
    if (!showProgress || !isCurrentArticle(articleId)) return;
    finishVirtualReading(agent.id, '没有新想法');
    setStatusMessage(`${agent.nickname} 暂无新想法`);
    window.setTimeout(() => setStatusMessage(''), 1400);
  }

  function finishAgentAnnotationRequest(agent: PublicAgent, showProgress: boolean) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, false);
    setStatusMessage((message) => (message.includes('暂无新想法') ? message : ''));
  }

  return {
    getContext: ({ currentArticle, options }) => {
      const articleId = options.articleId || currentArticle.id;
      const articleContext = options.article || promptArticle(currentArticle, currentArticleText());
      const articleScopedWrite = Boolean(options.articleId);
      const visibleArticle = isCurrentArticle(articleId);
      return {
        article: articleContext,
        articleId,
        articleScopedWrite,
        articleText: articleScopedWrite ? articleContext.text : currentArticleText(),
        showProgress: !articleScopedWrite || visibleArticle,
        visibleArticle,
      };
    },
    isBusy: ({ agent, context }) => !context.articleScopedWrite && isAgentAnnotating(agent.id),
    start: ({ agent, context, requestInput }) => {
      startAgentAnnotationPlayback(
        agent,
        requestInput.readingPlan,
        requestInput.playbackMode,
        context.showProgress !== false,
      );
    },
    onAnnotation: ({ annotation, context, requestInput }) =>
      handleAgentAnnotationStreamItem(
        context.articleId,
        annotation,
        requestInput.readingPlan,
        Boolean(context.articleScopedWrite),
        context.articleText,
      ),
    onEmpty: ({ agent, context }) => {
      if (context.showProgress !== false && isCurrentArticle(context.articleId)) {
        markVirtualReadingDone(agent.id);
      }
      finishEmptyAgentAnnotationPlayback(agent, context.articleId, context.showProgress !== false);
    },
    onSuccess: ({ agent, context }) => {
      if (context.showProgress !== false && isCurrentArticle(context.articleId)) {
        markVirtualReadingDone(agent.id);
        finishVirtualReadingIfIdle(agent.id);
      }
    },
    finish: ({ agent, context }) => {
      finishAgentAnnotationRequest(agent, context.showProgress !== false);
    },
  };
}
