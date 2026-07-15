import type { Dispatch, SetStateAction } from 'react';
import i18next from 'i18next';
import type { AgentReadingPlanItem, Annotation, PublicAgent } from '@yomitomo/shared';
import type { SourceAgentAnnotationPlaybackMode } from '../bookcase/app-source-agent-request';
import { promptArticle } from '../bookcase/app-source-bookcase-shared';
import {
  constrainSourceAgentPlanAnnotation,
  type SourceAgentAnnotationAdapter,
} from '../bookcase/use-source-reader-session';

type EbookSourceReaderControllerOptions = {
  appendAgentAnnotationToArticle: (
    articleId: string,
    annotation: Annotation,
  ) => Promise<string> | string;
  currentArticleText: () => string;
  enqueueAgentAnnotationPlayback: (
    articleId: string,
    annotation: Annotation,
    options?: { revealMissingRange?: boolean },
  ) => void;
  finishAgentDock: (agentId: string, completed: boolean) => void;
  finishVirtualReading: (agentId: string, message: string) => void;
  isAgentAnnotating: (agentId: string) => boolean;
  isCurrentArticle: (articleId: string) => boolean;
  setAgentAnnotating: (agentId: string, annotating: boolean) => void;
  setStatusMessage: Dispatch<SetStateAction<string>>;
  startAgentDock: (agent: PublicAgent) => void;
  startVirtualReading: (agent: PublicAgent, targetAnchor: Annotation['anchor']) => void;
  waitForPlaybackCompletion: () => Promise<void>;
};

export function createEbookSourceReaderController({
  appendAgentAnnotationToArticle,
  currentArticleText,
  enqueueAgentAnnotationPlayback,
  finishAgentDock,
  finishVirtualReading,
  isAgentAnnotating,
  isCurrentArticle,
  setAgentAnnotating,
  setStatusMessage,
  startAgentDock,
  startVirtualReading,
  waitForPlaybackCompletion,
}: EbookSourceReaderControllerOptions): SourceAgentAnnotationAdapter {
  function startEbookPlayback(
    agent: PublicAgent,
    articleId: string,
    targetAnchor: Annotation['anchor'] | undefined,
    playbackMode: SourceAgentAnnotationPlaybackMode,
  ) {
    setAgentAnnotating(agent.id, true);
    const visibleArticle = isCurrentArticle(articleId);
    if (visibleArticle) startAgentDock(agent);
    if (visibleArticle && playbackMode === 'target' && targetAnchor) {
      startVirtualReading(agent, targetAnchor);
    }
    return visibleArticle;
  }

  async function handleEbookStreamItem(
    articleId: string,
    annotation: Annotation,
    readingPlan: AgentReadingPlanItem[],
    articleText: string,
    revealMissingRange: boolean,
  ) {
    const constrainedAnnotation = constrainSourceAgentPlanAnnotation(
      annotation,
      readingPlan,
      articleText,
    );
    if (!constrainedAnnotation) return false;
    if (isCurrentArticle(articleId)) {
      enqueueAgentAnnotationPlayback(articleId, constrainedAnnotation, { revealMissingRange });
      return true;
    }
    await appendAgentAnnotationToArticle(articleId, constrainedAnnotation);
    return true;
  }

  function finishEmptyEbookPlayback(
    agent: PublicAgent,
    targetAnchor: Annotation['anchor'] | undefined,
  ) {
    const message = i18next.t('source.agentStatus.noNewThought');
    if (targetAnchor) finishVirtualReading(agent.id, message);
    setStatusMessage(
      i18next.t('source.agentStatus.noNewThoughtWithName', { name: agent.nickname }),
    );
    window.setTimeout(() => setStatusMessage(''), 1400);
  }

  async function finishEbookPlayback(agentId: string, visibleArticle: boolean) {
    if (!visibleArticle) return;
    await waitForPlaybackCompletion();
    finishAgentDock(agentId, true);
  }

  function finishEbookRequest(
    agent: PublicAgent,
    articleId: string,
    targetAnchor: Annotation['anchor'] | undefined,
    options: { requestFailed: boolean; visibleArticle: boolean },
  ) {
    if (options.requestFailed && targetAnchor && isCurrentArticle(articleId)) {
      finishVirtualReading(agent.id, i18next.t('source.agentStatus.addThoughtFailed'));
    }
    if (options.requestFailed && options.visibleArticle) finishAgentDock(agent.id, false);
    setAgentAnnotating(agent.id, false);
    setStatusMessage((message) =>
      message.includes(i18next.t('source.agentStatus.noNewThought')) ? message : '',
    );
  }

  return {
    getContext: ({ currentArticle, options }) => {
      const articleId = options.articleId || currentArticle.id;
      const articleContext = options.article || promptArticle(currentArticle, currentArticleText());
      return {
        article: articleContext,
        articleId,
        articleText: articleContext.text,
        visibleArticle: isCurrentArticle(articleId),
      };
    },
    isBusy: ({ agent, options }) => !options.articleId && isAgentAnnotating(agent.id),
    start: ({ agent, context, options, requestInput }) =>
      startEbookPlayback(agent, context.articleId, options.targetAnchor, requestInput.playbackMode),
    onAnnotation: ({ annotation, context, options, requestInput }) =>
      handleEbookStreamItem(
        context.articleId,
        annotation,
        requestInput.readingPlan,
        context.articleText,
        Boolean(options.targetAnchor),
      ),
    onEmpty: async ({ agent, context, options, playback }) => {
      if (isCurrentArticle(context.articleId)) {
        finishEmptyEbookPlayback(agent, options.targetAnchor);
      }
      await finishEbookPlayback(agent.id, Boolean(playback));
    },
    onSuccess: ({ agent, playback }) => finishEbookPlayback(agent.id, Boolean(playback)),
    finish: ({ agent, context, options, playback, requestFailed }) => {
      finishEbookRequest(agent, context.articleId, options.targetAnchor, {
        requestFailed,
        visibleArticle: Boolean(playback),
      });
    },
  };
}
