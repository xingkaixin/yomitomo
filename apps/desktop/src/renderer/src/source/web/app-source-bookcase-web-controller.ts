import type { Dispatch, SetStateAction } from 'react';
import i18next from 'i18next';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import { mergeAgentAnnotationAsThought } from '@yomitomo/core';
import type { ArticleAgentAnnotationMergeResult } from '../../../../ipc-contract';
import type { SourceAgentAnnotationPlaybackMode } from '../bookcase/app-source-agent-request';
import { promptArticle } from '../bookcase/source-prompt-article';
import {
  constrainSourceAgentPlanAnnotation,
  type SourceAgentAnnotationAdapter,
} from '../bookcase/use-source-reader-session';

type WebSourceReaderControllerOptions = {
  applyAnnotations: (annotations: Annotation[], updatedAt?: string) => void;
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
  onMergeArticleAgentAnnotation?: (
    articleId: string,
    annotation: Annotation,
  ) => Promise<ArticleAgentAnnotationMergeResult | null> | ArticleAgentAnnotationMergeResult | null;
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
  onMergeArticleAgentAnnotation,
  processAgentAnnotationQueue,
  setStatusMessage,
  startVirtualReading,
}: WebSourceReaderControllerOptions): SourceAgentAnnotationAdapter {
  async function appendAgentAnnotationToArticle(articleId: string, annotation: Annotation) {
    let activeId = annotation.id;
    if (isCurrentArticle(articleId)) {
      const result = mergeAgentAnnotationAsThought(getAnnotations(), annotation);
      activeId = result.activeId;
      applyAnnotations(result.annotations);
      onOpenAnnotation(result.activeId);
    }
    const persisted = await onMergeArticleAgentAnnotation?.(articleId, annotation);
    if (persisted) activeId = persisted.activeId;
    if (persisted && isCurrentArticle(articleId)) {
      applyAnnotations(persisted.patch.article.annotations, persisted.patch.article.updatedAt);
      onOpenAnnotation(persisted.activeId);
    }
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

  async function handleAgentAnnotationStreamItem(
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
      await appendAgentAnnotationToArticle(articleId, constrainedAnnotation);
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
    const message = i18next.t('source.agentStatus.noNewThought');
    finishVirtualReading(agent.id, message);
    setStatusMessage(
      i18next.t('source.agentStatus.noNewThoughtWithName', { name: agent.nickname }),
    );
    window.setTimeout(() => setStatusMessage(''), 1400);
  }

  function finishAgentAnnotationRequest(agent: PublicAgent, showProgress: boolean) {
    if (!showProgress) return;
    markAgentAnnotating(agent.id, false);
    setStatusMessage((message) =>
      message.includes(i18next.t('source.agentStatus.noNewThought')) ? message : '',
    );
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
