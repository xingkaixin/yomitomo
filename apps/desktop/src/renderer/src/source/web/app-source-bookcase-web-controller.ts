import type { Dispatch, SetStateAction } from 'react';
import i18next from 'i18next';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import type { ArticleAgentAnnotationMergeResult } from '../../../../ipc-contract';
import type { SourceAgentAnnotationPlaybackMode } from '../bookcase/app-source-agent-request';
import { appendAgentAnnotationToArticle as appendPersistedAgentAnnotation } from '../bookcase/append-agent-annotation-to-article';
import { promptArticle } from '../bookcase/source-prompt-article';
import {
  constrainSourceAgentPlanAnnotation,
  type SourceAgentAnnotationAdapter,
} from '../bookcase/use-source-reader-session';

type WebSourceReaderControllerOptions = {
  currentArticleText: () => string;
  enqueueAgentAnnotation: (annotation: Annotation) => void;
  finishVirtualReading: (agentId: string, message: string) => void;
  finishVirtualReadingIfIdle: (agentId: string) => void;
  isAgentAnnotating: (agentId: string) => boolean;
  isCurrentArticle: (articleId: string) => boolean;
  markAgentAnnotating: (agentId: string, annotating: boolean) => void;
  markVirtualReadingDone: (agentId: string) => void;
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
  currentArticleText,
  enqueueAgentAnnotation,
  finishVirtualReading,
  finishVirtualReadingIfIdle,
  isAgentAnnotating,
  isCurrentArticle,
  markAgentAnnotating,
  markVirtualReadingDone,
  onMergeArticleAgentAnnotation,
  processAgentAnnotationQueue,
  setStatusMessage,
  startVirtualReading,
}: WebSourceReaderControllerOptions): SourceAgentAnnotationAdapter {
  async function appendAgentAnnotationToArticle(
    articleId: string,
    annotation: Annotation,
    surface: Parameters<SourceAgentAnnotationAdapter['prepare']>[0]['surface'],
  ) {
    return appendPersistedAgentAnnotation({
      annotations: surface.annotations,
      applyAnnotations: surface.applyAnnotations,
      annotation,
      articleId,
      isCurrentArticle,
      mergeArticleAgentAnnotation: onMergeArticleAgentAnnotation,
      onOpenAnnotation: (annotationId) => {
        if (annotationId) surface.openAnnotation?.(annotationId);
      },
    });
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
    surface: Parameters<SourceAgentAnnotationAdapter['prepare']>[0]['surface'],
  ) {
    const constrainedAnnotation = constrainSourceAgentPlanAnnotation(
      annotation,
      readingPlan,
      articleText,
    );
    if (!constrainedAnnotation) return false;
    if (articleScopedWrite) {
      await appendAgentAnnotationToArticle(articleId, constrainedAnnotation, surface);
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
    prepare: ({ agent, currentArticle, options, surface }) => {
      const articleId = options.articleId || currentArticle.id;
      const articleContext = options.article || promptArticle(currentArticle, currentArticleText());
      const articleScopedWrite = Boolean(options.articleId);
      const visibleArticle = isCurrentArticle(articleId);
      const context = {
        article: articleContext,
        articleId,
        articleScopedWrite,
        articleText: articleScopedWrite ? articleContext.text : currentArticleText(),
        showProgress: !articleScopedWrite || visibleArticle,
        visibleArticle,
      };
      if (!context.articleScopedWrite && isAgentAnnotating(agent.id)) return null;
      return {
        context,
        options,
        start: (requestInput) => {
          startAgentAnnotationPlayback(
            agent,
            requestInput.readingPlan,
            requestInput.playbackMode,
            context.showProgress,
          );
          return {
            accept: (annotation) =>
              handleAgentAnnotationStreamItem(
                context.articleId,
                annotation,
                requestInput.readingPlan,
                context.articleScopedWrite,
                context.articleText,
                surface,
              ),
            finish: (outcome) => {
              if (outcome.status === 'empty') {
                if (context.showProgress && isCurrentArticle(context.articleId)) {
                  markVirtualReadingDone(agent.id);
                }
                finishEmptyAgentAnnotationPlayback(agent, context.articleId, context.showProgress);
              }
              if (
                outcome.status === 'success' &&
                context.showProgress &&
                isCurrentArticle(context.articleId)
              ) {
                markVirtualReadingDone(agent.id);
                finishVirtualReadingIfIdle(agent.id);
              }
              finishAgentAnnotationRequest(agent, context.showProgress);
            },
          };
        },
      };
    },
  };
}
