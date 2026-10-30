import { useMemo, useReducer } from 'react';
import type {
  Agent,
  Annotation,
  ArticleRecord,
  Comment as AnnotationComment,
  UiLanguage,
  UserProfile,
} from '@yomitomo/shared';
import { publicAnnotationAgents, publicPersonaAgents } from './source-public-agents';
import { usePendingAnnotationAgents } from '../../shell/use-pending-annotation-agents';
import { useSourceAnnotations } from './use-source-annotations';

type SourceAnnotationsChange = {
  previousAnnotations: Annotation[];
  nextAnnotations: Annotation[];
  previousArticle: ArticleRecord;
  nextArticle: ArticleRecord;
};

export type UseSourceReaderSessionOptions = {
  agents: Agent[];
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

  // Ebook and PDF readers stay mounted across articles, so the switch is handled while rendering.
  const [pendingArticleId, articleOpened] = useReducer(openedArticleReducer, article.id);
  if (pendingArticleId !== article.id) {
    articleOpened(article.id);
    if (clearPendingOnArticleChange) clearAllPendingAnnotationAgents();
  }

  return {
    annotationAgents,
    personaAgents,
    ...pendingAgents,
    ...sourceAnnotations,
  };
}

function openedArticleReducer(_previousArticleId: string, articleId: string) {
  return articleId;
}
