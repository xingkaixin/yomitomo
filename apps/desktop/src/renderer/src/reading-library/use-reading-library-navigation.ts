import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { articleCounts } from '@yomitomo/core';
import type {
  ArticleRecord,
  ArticleSummaryRecord,
  ContentRef,
  WeReadBookDetail,
} from '@yomitomo/shared';
import type { CurrentArticleSink } from '../shell/app-article-store';

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
  const contentLoadRef = useRef<ContentRef | null>(null);
  const discussionArticleIdRef = useRef<string | null>(null);

  const send = useCallback((event: ReadingLibraryNavigationEvent) => {
    routeRef.current = readingLibraryRoute(routeRef.current, event);
    dispatch(event);
  }, []);

  const cancelContentLoad = useCallback(() => {
    contentLoadRef.current = null;
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
    cancelContentLoad();
    closeCurrentArticle();
    send({ type: 'reset-library' });
  }, [cancelContentLoad, closeCurrentArticle, send]);

  const removeArticleRoute = useCallback(
    (articleId: string) => {
      const currentLoad = contentLoadRef.current;
      if (currentLoad?.kind === 'article' && currentLoad.id === articleId) {
        cancelContentLoad();
      }
      const current = routeRef.current;
      if (current.type !== 'article' || current.article.id !== articleId) return;
      closeCurrentArticle();
      send({ type: 'reset-library' });
    },
    [cancelContentLoad, closeCurrentArticle, send],
  );

  const returnToLibrary = useCallback(() => {
    cancelContentLoad();
    closeCurrentArticle();
    send({ type: 'return-to-library' });
  }, [cancelContentLoad, closeCurrentArticle, send]);

  const loadContent = useCallback(
    async <T>(
      target: ContentRef,
      read: () => T | null | Promise<T | null>,
      onLoaded: (value: T | null) => void,
    ) => {
      closeCurrentArticle(target.kind === 'article' ? target.id : undefined);
      contentLoadRef.current = target;
      let value: T | null;
      try {
        value = await read();
      } catch (error) {
        if (contentLoadRef.current === target) contentLoadRef.current = null;
        throw error;
      }
      if (contentLoadRef.current !== target) return null;
      contentLoadRef.current = null;
      onLoaded(value);
      return value;
    },
    [closeCurrentArticle],
  );

  const openArticle = useCallback(
    (article: ArticleRecord | ArticleSummaryRecord | string, focusAnnotationId?: string) => {
      const articleId = typeof article === 'string' ? article : article.id;
      return loadContent(
        { kind: 'article', id: articleId },
        () =>
          typeof article !== 'string' && articleHasReadableBody(article)
            ? article
            : onReadArticle(articleId),
        (fullArticle) => {
          if (!fullArticle) throw new Error('Reading source is unavailable');
          discussionArticleIdRef.current = fullArticle.id;
          send({ type: 'show-article', article: fullArticle, focusAnnotationId });
        },
      );
    },
    [loadContent, onReadArticle, send],
  );

  const focusArticle = useCallback(
    (article: ArticleRecord, annotationId: string) => {
      cancelContentLoad();
      closeCurrentArticle(article.id);
      discussionArticleIdRef.current = article.id;
      send({ type: 'show-article', article, focusAnnotationId: annotationId });
    },
    [cancelContentLoad, closeCurrentArticle, send],
  );

  const openWeReadBook = useCallback(
    (bookId: string, read: () => Promise<WeReadBookDetail | null>) =>
      loadContent({ kind: 'weread', id: bookId }, read, (detail) => {
        send(detail ? { type: 'show-weread', detail } : { type: 'reset-library' });
      }),
    [loadContent, send],
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

  const getCurrentArticle = useCallback(() => {
    const current = routeRef.current;
    return current.type === 'article' ? current.article : null;
  }, []);
  const currentArticleSink = useMemo<CurrentArticleSink>(
    () => ({
      isCurrent: isCurrentArticle,
      apply: (update) => {
        switch (update.type) {
          case 'delete':
            removeArticleRoute(update.articleId);
            return;
          case 'update':
            updateArticle(update.articleId, update.update);
        }
      },
    }),
    [isCurrentArticle, removeArticleRoute, updateArticle],
  );

  useEffect(
    () => () => {
      cancelContentLoad();
      const articleId = discussionArticleIdRef.current;
      discussionArticleIdRef.current = null;
      if (articleId) void onCloseArticleDiscussions?.(articleId);
    },
    [cancelContentLoad, onCloseArticleDiscussions],
  );

  const model = useMemo(() => readingLibraryNavigationModel(route), [route]);
  const actions = useMemo(
    () => ({
      consumeArticleFocus,
      focusArticle,
      getCurrentArticle,
      isCurrentArticle,
      openArticle,
      replaceArticle,
      resetLibrary,
      returnToLibrary,
      selectAnnotation,
      openWeReadBook,
      updateArticle,
    }),
    [
      consumeArticleFocus,
      focusArticle,
      getCurrentArticle,
      isCurrentArticle,
      openArticle,
      replaceArticle,
      resetLibrary,
      returnToLibrary,
      selectAnnotation,
      openWeReadBook,
      updateArticle,
    ],
  );

  return { actions, currentArticleSink, model };
}

export type ReadingLibraryNavigation = ReturnType<typeof useReadingLibraryNavigation>;

export function articleUpdateCanReplace(
  current: ArticleRecord | ArticleSummaryRecord,
  candidate: ArticleRecord | ArticleSummaryRecord,
) {
  const currentTimestamp = articleTimestamp(current.updatedAt);
  const candidateTimestamp = articleTimestamp(candidate.updatedAt);
  if (candidateTimestamp !== currentTimestamp) return candidateTimestamp > currentTimestamp;
  return articleRevision(candidate) !== articleRevision(current);
}

function articleTimestamp(value: string | number | undefined) {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function articleRevision(article: ArticleRecord | ArticleSummaryRecord) {
  const counts = articleCounts(article);
  return [
    counts.annotationCount,
    counts.thoughtCount,
    counts.aiCommentCount,
    counts.distillationCount,
  ].join(':');
}

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
  if ('counts' in article) return false;
  if (article.sourceType === 'ebook') {
    return Boolean(article.ebook && 'chapters' in article.ebook && article.ebook.chapters.length);
  }
  if (article.sourceType === 'pdf') return false;
  return Boolean('contentHtml' in article && article.contentHtml);
}
