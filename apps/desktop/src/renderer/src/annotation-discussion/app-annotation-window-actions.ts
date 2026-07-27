import type { YomitomoDesktopApi } from '../../../preload';
import { getDesktopApi } from '../shell/app-desktop-api';

type AnnotationWindowDesktopApi = Pick<
  YomitomoDesktopApi,
  'agent' | 'annotations' | 'article' | 'platform' | 'store'
>;

export function createAnnotationWindowActions(getDesktop: () => AnnotationWindowDesktopApi) {
  return {
    commitSedimentation: (
      input: Parameters<AnnotationWindowDesktopApi['annotations']['sedimentation']['commit']>[0],
    ) => getDesktop().annotations.sedimentation.commit(input),
    deleteCommentAndReload: async (articleId: string, annotationId: string, commentId: string) => {
      const desktop = getDesktop();
      await desktop.article.deleteComment({ articleId, annotationId, commentId });
      return desktop.article.get(articleId);
    },
    loadArticle: (articleId: string) => getDesktop().article.get(articleId),
    loadWindow: async (articleId: string) => {
      const desktop = getDesktop();
      const [article, store] = await Promise.all([
        desktop.article.get(articleId),
        desktop.store.getState(),
      ]);
      return { article, store };
    },
    openSedimentation: (
      input: Parameters<AnnotationWindowDesktopApi['annotations']['sedimentation']['open']>[0],
    ) => getDesktop().annotations.sedimentation.open(input),
    planAgentMentionRoute: (
      input: Parameters<AnnotationWindowDesktopApi['agent']['planMentionRoute']>[0],
    ) => getDesktop().agent.planMentionRoute(input),
    platform: () => getDesktop().platform,
    requestAgentCommentStream: (
      payload: Parameters<AnnotationWindowDesktopApi['agent']['requestCommentStream']>[0],
      onEvent: Parameters<AnnotationWindowDesktopApi['agent']['requestCommentStream']>[1],
    ) => getDesktop().agent.requestCommentStream(payload, onEvent),
    requestAgentDistillationReviewStream: (
      payload: Parameters<
        AnnotationWindowDesktopApi['agent']['requestDistillationReviewStream']
      >[0],
      onEvent: Parameters<
        AnnotationWindowDesktopApi['agent']['requestDistillationReviewStream']
      >[1],
    ) => getDesktop().agent.requestDistillationReviewStream(payload, onEvent),
    saveComment: (
      articleId: string,
      annotationId: string,
      comment: Parameters<AnnotationWindowDesktopApi['article']['saveComment']>[0]['comment'],
      updatedAt?: string,
    ) => getDesktop().article.saveComment({ articleId, annotationId, comment, updatedAt }),
    saveDistillationAndReload: async (
      input: Parameters<AnnotationWindowDesktopApi['article']['saveAnnotationDistillation']>[0],
    ) => {
      const desktop = getDesktop();
      const patch = await desktop.article.saveAnnotationDistillation(input);
      return patch ? desktop.article.get(patch.article.id) : null;
    },
    subscribeToArticlePatches: (
      onPatch: Parameters<AnnotationWindowDesktopApi['article']['onPatched']>[0],
    ) => {
      const subscribe = getDesktop().article?.onPatched;
      return typeof subscribe === 'function' ? subscribe(onPatch) : () => undefined;
    },
  };
}

export type AnnotationWindowActions = ReturnType<typeof createAnnotationWindowActions>;

export const annotationWindowActions = createAnnotationWindowActions(getDesktopApi);
