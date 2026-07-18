import type { YomitomoDesktopApi } from '../../../preload';

type AnnotationWindowDesktopApi = Pick<
  YomitomoDesktopApi,
  | 'commitAnnotationSedimentation'
  | 'deleteArticleComment'
  | 'getArticle'
  | 'getState'
  | 'onArticlePatched'
  | 'openAnnotationSedimentation'
  | 'planAgentMentionRoute'
  | 'requestAgentCommentStream'
  | 'requestAgentDistillationReviewStream'
  | 'saveArticleAnnotationDistillation'
  | 'saveArticleComment'
  | 'platform'
>;

export function createAnnotationWindowActions(getDesktop: () => AnnotationWindowDesktopApi) {
  return {
    commitSedimentation: (
      input: Parameters<AnnotationWindowDesktopApi['commitAnnotationSedimentation']>[0],
    ) => getDesktop().commitAnnotationSedimentation(input),
    deleteCommentAndReload: async (articleId: string, annotationId: string, commentId: string) => {
      const desktop = getDesktop();
      await desktop.deleteArticleComment(articleId, annotationId, commentId);
      return desktop.getArticle(articleId);
    },
    loadArticle: (articleId: string) => getDesktop().getArticle(articleId),
    loadWindow: async (articleId: string) => {
      const desktop = getDesktop();
      const [article, store] = await Promise.all([
        desktop.getArticle(articleId),
        desktop.getState(),
      ]);
      return { article, store };
    },
    openSedimentation: (
      input: Parameters<AnnotationWindowDesktopApi['openAnnotationSedimentation']>[0],
    ) => getDesktop().openAnnotationSedimentation(input),
    planAgentMentionRoute: (
      input: Parameters<AnnotationWindowDesktopApi['planAgentMentionRoute']>[0],
    ) => getDesktop().planAgentMentionRoute(input),
    platform: () => getDesktop().platform,
    requestAgentCommentStream: (
      payload: Parameters<AnnotationWindowDesktopApi['requestAgentCommentStream']>[0],
      onEvent: Parameters<AnnotationWindowDesktopApi['requestAgentCommentStream']>[1],
    ) => getDesktop().requestAgentCommentStream(payload, onEvent),
    requestAgentDistillationReviewStream: (
      payload: Parameters<AnnotationWindowDesktopApi['requestAgentDistillationReviewStream']>[0],
      onEvent: Parameters<AnnotationWindowDesktopApi['requestAgentDistillationReviewStream']>[1],
    ) => getDesktop().requestAgentDistillationReviewStream(payload, onEvent),
    saveComment: (
      articleId: string,
      annotationId: string,
      comment: Parameters<AnnotationWindowDesktopApi['saveArticleComment']>[2],
      updatedAt?: string,
    ) => getDesktop().saveArticleComment(articleId, annotationId, comment, updatedAt),
    saveDistillationAndReload: async (
      input: Parameters<AnnotationWindowDesktopApi['saveArticleAnnotationDistillation']>[0],
    ) => {
      const desktop = getDesktop();
      const patch = await desktop.saveArticleAnnotationDistillation(input);
      return patch ? desktop.getArticle(patch.article.id) : null;
    },
    subscribeToArticlePatches: (
      onPatch: Parameters<AnnotationWindowDesktopApi['onArticlePatched']>[0],
    ) => {
      const subscribe = getDesktop().onArticlePatched;
      return typeof subscribe === 'function' ? subscribe(onPatch) : () => undefined;
    },
  };
}

export type AnnotationWindowActions = ReturnType<typeof createAnnotationWindowActions>;

export const annotationWindowActions = createAnnotationWindowActions(() => window.yomitomoDesktop);
