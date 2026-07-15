import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { ArticleRecord, ArticleSummaryRecord, WeReadBookDetail } from '@yomitomo/shared';

type ReadingLibraryRoute =
  | { type: 'library' }
  | {
      type: 'article';
      location: 'library' | 'source';
      article: ArticleRecord;
      selectedAnnotationId: string | null;
      focusAnnotationId: string | null;
    }
  | { type: 'weread'; location: 'library' | 'source'; detail: WeReadBookDetail };

type ReadingLibraryNavigationEvent =
  | { type: 'reset-library' }
  | { type: 'return-to-library' }
  | { type: 'show-article'; article: ArticleRecord; focusAnnotationId?: string }
  | { type: 'show-weread'; detail: WeReadBookDetail }
  | { type: 'select-annotation'; annotationId: string | null }
  | { type: 'consume-article-focus' }
  | { type: 'replace-article'; article: ArticleRecord }
  | {
      type: 'update-article';
      articleId: string;
      update: (article: ArticleRecord) => ArticleRecord;
    };

type ArticleLoadLifecycle =
  | { status: 'idle'; token: number }
  | { status: 'loading'; token: number; articleId: string };

type UseReadingLibraryNavigationOptions = {
  onCloseArticleDiscussions?: (articleId: string) => Promise<void> | void;
  onReadArticle: (articleId: string) => Promise<ArticleRecord | null>;
};

export function useReadingLibraryNavigation({
  onCloseArticleDiscussions,
  onReadArticle,
}: UseReadingLibraryNavigationOptions) {
  const [route, dispatch] = useReducer(readingLibraryRoute, { type: 'library' });
  const routeRef = useRef<ReadingLibraryRoute>(route);
  const articleLoadRef = useRef<ArticleLoadLifecycle>({ status: 'idle', token: 0 });
  const discussionArticleIdRef = useRef<string | null>(null);

  const send = useCallback((event: ReadingLibraryNavigationEvent) => {
    routeRef.current = readingLibraryRoute(routeRef.current, event);
    dispatch(event);
  }, []);

  const cancelArticleLoad = useCallback(() => {
    articleLoadRef.current = { status: 'idle', token: articleLoadRef.current.token + 1 };
  }, []);

  const closeCurrentArticle = useCallback(
    (nextArticleId?: string) => {
      const articleId = discussionArticleIdRef.current;
      if (!articleId || articleId === nextArticleId) return;
      discussionArticleIdRef.current = null;
      void onCloseArticleDiscussions?.(articleId);
    },
    [onCloseArticleDiscussions],
  );

  const resetLibrary = useCallback(() => {
    cancelArticleLoad();
    closeCurrentArticle();
    send({ type: 'reset-library' });
  }, [cancelArticleLoad, closeCurrentArticle, send]);

  const returnToLibrary = useCallback(() => {
    cancelArticleLoad();
    closeCurrentArticle();
    send({ type: 'return-to-library' });
  }, [cancelArticleLoad, closeCurrentArticle, send]);

  const openArticle = useCallback(
    async (article: ArticleSummaryRecord | string, focusAnnotationId?: string) => {
      const articleId = typeof article === 'string' ? article : article.id;
      closeCurrentArticle(articleId);
      const token = articleLoadRef.current.token + 1;
      articleLoadRef.current = { status: 'loading', token, articleId };
      const fullArticle =
        typeof article !== 'string' && articleHasReadableBody(article)
          ? article
          : await onReadArticle(articleId);
      const currentLoad = articleLoadRef.current;
      if (
        currentLoad.status !== 'loading' ||
        currentLoad.token !== token ||
        currentLoad.articleId !== articleId
      ) {
        return null;
      }
      articleLoadRef.current = { status: 'idle', token };
      if (!fullArticle) return null;
      discussionArticleIdRef.current = fullArticle.id;
      send({ type: 'show-article', article: fullArticle, focusAnnotationId });
      return fullArticle;
    },
    [closeCurrentArticle, onReadArticle, send],
  );

  const focusArticle = useCallback(
    (article: ArticleRecord, annotationId: string) => {
      cancelArticleLoad();
      closeCurrentArticle(article.id);
      discussionArticleIdRef.current = article.id;
      send({ type: 'show-article', article, focusAnnotationId: annotationId });
    },
    [cancelArticleLoad, closeCurrentArticle, send],
  );

  const showWeReadBook = useCallback(
    (detail: WeReadBookDetail) => {
      cancelArticleLoad();
      closeCurrentArticle();
      send({ type: 'show-weread', detail });
    },
    [cancelArticleLoad, closeCurrentArticle, send],
  );

  const selectAnnotation = useCallback(
    (annotationId: string | null) => send({ type: 'select-annotation', annotationId }),
    [send],
  );

  const consumeArticleFocus = useCallback(() => send({ type: 'consume-article-focus' }), [send]);

  const replaceArticle = useCallback(
    (article: ArticleRecord) => send({ type: 'replace-article', article }),
    [send],
  );

  const updateArticle = useCallback(
    (articleId: string, update: (article: ArticleRecord) => ArticleRecord) =>
      send({ type: 'update-article', articleId, update }),
    [send],
  );

  const isCurrentArticle = useCallback((articleId: string) => {
    const current = routeRef.current;
    return current.type === 'article' && current.article.id === articleId;
  }, []);

  useEffect(
    () => () => {
      cancelArticleLoad();
      const articleId = discussionArticleIdRef.current;
      discussionArticleIdRef.current = null;
      if (articleId) void onCloseArticleDiscussions?.(articleId);
    },
    [cancelArticleLoad, onCloseArticleDiscussions],
  );

  const model = useMemo(() => readingLibraryNavigationModel(route), [route]);
  const actions = useMemo(
    () => ({
      consumeArticleFocus,
      focusArticle,
      isCurrentArticle,
      openArticle,
      replaceArticle,
      resetLibrary,
      returnToLibrary,
      selectAnnotation,
      showWeReadBook,
      updateArticle,
    }),
    [
      consumeArticleFocus,
      focusArticle,
      isCurrentArticle,
      openArticle,
      replaceArticle,
      resetLibrary,
      returnToLibrary,
      selectAnnotation,
      showWeReadBook,
      updateArticle,
    ],
  );

  return { actions, model };
}

export type ReadingLibraryNavigation = ReturnType<typeof useReadingLibraryNavigation>;

function readingLibraryRoute(
  route: ReadingLibraryRoute,
  event: ReadingLibraryNavigationEvent,
): ReadingLibraryRoute {
  switch (event.type) {
    case 'reset-library':
      return { type: 'library' };
    case 'return-to-library':
      if (route.type === 'library') return route;
      if (route.type === 'article') {
        return {
          ...route,
          location: 'library',
          selectedAnnotationId: null,
          focusAnnotationId: null,
        };
      }
      return { ...route, location: 'library' };
    case 'show-article':
      return {
        type: 'article',
        location: 'source',
        article: event.article,
        selectedAnnotationId: event.focusAnnotationId || null,
        focusAnnotationId: event.focusAnnotationId || null,
      };
    case 'show-weread':
      return { type: 'weread', location: 'source', detail: event.detail };
    case 'select-annotation':
      return route.type === 'article'
        ? { ...route, selectedAnnotationId: event.annotationId }
        : route;
    case 'consume-article-focus':
      return route.type === 'article' ? { ...route, focusAnnotationId: null } : route;
    case 'replace-article':
      return route.type === 'article' && route.article.id === event.article.id
        ? { ...route, article: event.article }
        : route;
    case 'update-article':
      return route.type === 'article' && route.article.id === event.articleId
        ? { ...route, article: event.update(route.article) }
        : route;
  }
}

function readingLibraryNavigationModel(route: ReadingLibraryRoute) {
  const location = route.type === 'library' ? 'library' : route.location;
  return {
    activeShelf: location,
    article: route.type === 'article' ? route.article : null,
    focusAnnotationId: route.type === 'article' ? route.focusAnnotationId : null,
    routeType: route.type,
    routeTransition:
      route.type === 'library'
        ? ('none' as const)
        : location === 'source'
          ? ('enter-source' as const)
          : ('enter-library' as const),
    selectedAnnotationId: route.type === 'article' ? route.selectedAnnotationId : null,
    wereadBook: route.type === 'weread' ? route.detail : null,
  };
}

function articleHasReadableBody(
  article: ArticleRecord | ArticleSummaryRecord,
): article is ArticleRecord {
  if ((article.annotationCount ?? 0) > article.annotations.length) return false;
  if (article.sourceType === 'ebook') {
    return Boolean(article.ebook && 'chapters' in article.ebook && article.ebook.chapters.length);
  }
  if (article.sourceType === 'pdf') return false;
  return Boolean('contentHtml' in article && article.contentHtml);
}
