import type { Annotation, ArticleRecord, ArticleStorePatch, DesktopStore } from '@yomitomo/shared';
import { applyAppTheme, readCachedThemeId, themeRegistry, type AppTheme } from '../theme/app-theme';
import { annotationWindowActions } from './app-annotation-window-actions';

export type AnnotationWindowRoute = {
  annotationId: string;
  articleId: string;
  params: URLSearchParams;
};

export function readAnnotationWindowRoute(): AnnotationWindowRoute {
  const params = new URLSearchParams(window.location.search);
  return {
    annotationId: params.get('annotationId') || '',
    articleId: params.get('articleId') || '',
    params,
  };
}

/**
 * Loads the window's article and reloads it whenever main patches that article. Returns the
 * unsubscribe function.
 */
export function bindAnnotationWindowArticle(
  { annotationId, articleId }: AnnotationWindowRoute,
  events: {
    failed: (error: unknown) => void;
    loaded: (input: {
      annotation: Annotation;
      article: ArticleRecord;
      store: DesktopStore;
    }) => void;
    missing: () => void;
    patched: (article: ArticleRecord, annotation: Annotation) => void;
  },
) {
  if (!articleId || !annotationId) {
    events.missing();
    return () => undefined;
  }
  let active = true;
  let refreshVersion = 0;
  // A patch reload that settles before the initial load is newer than the initial snapshot.
  let patchedArticle: ArticleRecord | null | undefined;

  const unsubscribe = annotationWindowActions.subscribeToArticlePatches((patch) => {
    if (!changesAnnotationWindow(patch) || articleIdFromPatch(patch) !== articleId) return;
    const version = ++refreshVersion;
    void annotationWindowActions
      .loadArticle(articleId)
      .then((article) => {
        if (!active || version !== refreshVersion) return;
        const annotation = findAnnotation(article, annotationId);
        patchedArticle = article && annotation ? article : null;
        if (article && annotation) events.patched(article, annotation);
        else events.missing();
      })
      .catch(() => undefined);
  });

  void annotationWindowActions
    .loadWindow(articleId)
    .then(({ article, store }) => {
      if (!active) return;
      const currentArticle = patchedArticle === undefined ? article : patchedArticle;
      const annotation = findAnnotation(currentArticle, annotationId);
      if (!currentArticle || !annotation) {
        events.missing();
        return;
      }
      events.loaded({ annotation, article: currentArticle, store });
    })
    .catch((error: unknown) => {
      if (active) events.failed(error);
    });

  return () => {
    active = false;
    unsubscribe();
  };
}

/** Follows theme changes made in other windows. Returns the unsubscribe function. */
export function bindAnnotationWindowTheme(onApplied: (theme: AppTheme) => void = () => undefined) {
  const syncTheme = () => {
    const theme = themeRegistry[readCachedThemeId()];
    applyAppTheme(theme);
    onApplied(theme);
  };
  window.addEventListener('storage', syncTheme);
  window.addEventListener('focus', syncTheme);
  return () => {
    window.removeEventListener('storage', syncTheme);
    window.removeEventListener('focus', syncTheme);
  };
}

function findAnnotation(article: ArticleRecord | null, annotationId: string) {
  return article?.annotations.find((item) => item.id === annotationId);
}

// Annotation windows do not show reading progress or reader chat state; reloading the full
// article for those patches would run on every page turn.
function changesAnnotationWindow(patch: ArticleStorePatch) {
  return patch.type !== 'article-reading-progress' && patch.type !== 'article-reader-chat-state';
}

function articleIdFromPatch(patch: ArticleStorePatch) {
  return patch.type === 'article-upsert' ? patch.article.id : patch.articleId;
}
