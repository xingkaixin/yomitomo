import { useCallback, useEffectEvent, useMemo, useReducer, useRef, type RefObject } from 'react';
import { useMountEffect } from '@yomitomo/reader-ui/use-mount-effect';
import { useTranslation } from 'react-i18next';
import type { Annotation, ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import {
  articleHtmlWithBilingualTranslation,
  extractWebArticleTranslationBlocks,
  getArticleSelection,
  isRangeInsideArticle,
  scrollReaderSurfaceToRect,
} from '@yomitomo/core';
import { appToast } from '../../shell/app-toast';
import {
  useSourceBilingualTranslation,
  type TranslationSurfaceAdapter,
} from '../bookcase/use-source-bilingual-translation';
import {
  describeArticleTranslationDom,
  logReaderSelectionDebug,
} from './web-reader-selection-debug';

const translationSelectionToastThrottleMs = 2000;
const translationSuccessFeedbackDurationMs = 2000;
const emptyTranslationSuccessBlockIds = new Set<string>();

type WebArticleHtmlState = {
  frozen: boolean;
  // The latest html, shown once a selection gesture no longer freezes the article.
  latestHtml: string;
  shownHtml: string;
  successBlockIds: ReadonlySet<string>;
};

type WebArticleHtmlEvent =
  | { type: 'htmlArrived'; html: string; selectionActive: boolean }
  | { type: 'selectionFinished' }
  | { type: 'selectionStarted' }
  | { type: 'successFeedbackCleared'; blockIds: Iterable<string> | 'all' }
  | { type: 'translationSegmentSucceeded'; blockId: string };

function webArticleHtmlReducer(
  state: WebArticleHtmlState,
  event: WebArticleHtmlEvent,
): WebArticleHtmlState {
  switch (event.type) {
    case 'htmlArrived': {
      const frozen = state.frozen || event.selectionActive;
      return {
        ...state,
        frozen,
        latestHtml: event.html,
        shownHtml: frozen ? state.shownHtml : event.html,
      };
    }
    case 'selectionFinished':
      return state.frozen ? { ...state, frozen: false, shownHtml: state.latestHtml } : state;
    case 'selectionStarted':
      return state.frozen ? state : { ...state, frozen: true };
    case 'successFeedbackCleared': {
      if (state.successBlockIds.size === 0) return state;
      if (event.blockIds === 'all') return { ...state, successBlockIds: new Set() };
      const successBlockIds = new Set(state.successBlockIds);
      for (const blockId of event.blockIds) successBlockIds.delete(blockId);
      return successBlockIds.size === state.successBlockIds.size
        ? state
        : { ...state, successBlockIds };
    }
    case 'translationSegmentSucceeded':
      return state.successBlockIds.has(event.blockId)
        ? state
        : { ...state, successBlockIds: new Set(state.successBlockIds).add(event.blockId) };
  }
}

type UseWebBilingualTranslationInput = {
  annotations: Annotation[];
  article: ArticleRecord;
  articleRef: RefObject<HTMLElement | null>;
  contentHtml: string;
  deleteAnnotation: (annotationId: string) => Promise<void>;
  scrollRef: RefObject<HTMLElement | null>;
  style: string;
  targetLanguage?: string;
};

export function useWebBilingualTranslation({
  annotations,
  article,
  articleRef,
  contentHtml,
  deleteAnnotation,
  scrollRef,
  style,
  targetLanguage,
}: UseWebBilingualTranslationInput) {
  const { t } = useTranslation();
  const [view, dispatch] = useReducer(webArticleHtmlReducer, contentHtml, (html) => ({
    frozen: false,
    latestHtml: html,
    shownHtml: html,
    successBlockIds: emptyTranslationSuccessBlockIds,
  }));
  const htmlRenderFlushTimerRef = useRef<number | null>(null);
  const translationSuccessTimerRef = useRef(new Map<string, number>());
  const selectionToastAtRef = useRef(0);
  const readAnnotations = useEffectEvent(() => annotations);

  const scrollTranslationBlockIntoView = useCallback(
    (blockId: string) => {
      const articleElement = articleRef.current;
      const scrollElement = scrollRef.current;
      if (!articleElement || !scrollElement) return;
      const target = translationBlockElement(
        articleElement,
        '[data-reader-translation-block-id]',
        blockId,
      );
      const source = translationBlockElement(
        articleElement,
        '[data-reader-source-block-id]',
        blockId,
      );
      const element = target || source;
      if (!element) return;
      scrollReaderSurfaceToRect(scrollElement, element.getBoundingClientRect(), 82);
      if (target instanceof HTMLButtonElement) target.focus();
    },
    [articleRef, scrollRef],
  );

  const { successBlockIds } = view;
  const translationSurface = useMemo<TranslationSurfaceAdapter<string>>(
    () => ({
      applyTranslation: (translation, visible) =>
        visible && translation
          ? articleHtmlWithBilingualTranslation(document, contentHtml, translation, {
              retryLabel: t('readerTranslation.common.retryTranslationSegment'),
              style,
              successBlockIds:
                translation.status === 'translating'
                  ? emptyTranslationSuccessBlockIds
                  : successBlockIds,
            })
          : contentHtml,
      extractBlocks: () =>
        extractWebArticleTranslationBlocks(document, contentHtml).map(({ id, text }) => ({
          id,
          text,
        })),
      scrollToBlock: scrollTranslationBlockIntoView,
    }),
    [contentHtml, scrollTranslationBlockIntoView, style, successBlockIds, t],
  );

  const countTranslationAnnotations = useCallback(
    (blockIds: ReadonlySet<string>) =>
      translationAnnotationsForBlocks(annotations, blockIds).length,
    [annotations],
  );
  const prepareTranslationAnnotationRemoval = useCallback(
    (blockIds: ReadonlySet<string>) => {
      const affected = translationAnnotationsForBlocks(readAnnotations(), blockIds);
      return async () => {
        for (const annotation of affected) await deleteAnnotation(annotation.id);
      };
    },
    [deleteAnnotation],
  );
  const translationAnnotations = useMemo(
    () => ({
      count: countTranslationAnnotations,
      prepareRemoval: prepareTranslationAnnotationRemoval,
    }),
    [countTranslationAnnotations, prepareTranslationAnnotationRemoval],
  );

  const clearTranslationSuccessFeedback = useCallback((blockIds: Iterable<string> | 'all') => {
    const timers = translationSuccessTimerRef.current;
    for (const blockId of blockIds === 'all' ? [...timers.keys()] : blockIds) {
      window.clearTimeout(timers.get(blockId));
      timers.delete(blockId);
    }
    dispatch({ type: 'successFeedbackCleared', blockIds });
  }, []);

  const showTranslationSuccessFeedback = useCallback((blockId: string) => {
    const timers = translationSuccessTimerRef.current;
    window.clearTimeout(timers.get(blockId));
    dispatch({ type: 'translationSegmentSucceeded', blockId });
    timers.set(
      blockId,
      window.setTimeout(() => {
        timers.delete(blockId);
        dispatch({ type: 'successFeedbackCleared', blockIds: [blockId] });
      }, translationSuccessFeedbackDurationMs),
    );
  }, []);

  const receiveTranslation = useCallback(
    (translation: ArticleTranslation, previous: ArticleTranslation | null) => {
      if (!previous) clearTranslationSuccessFeedback('all');
      const previousStatuses = new Map(
        previous?.segments.map((segment) => [segment.sourceBlockId, segment.status] as const),
      );
      const clearedBlockIds = new Set<string>(previousStatuses.keys());
      for (const segment of translation.segments) {
        const previousStatus = previousStatuses.get(segment.sourceBlockId);
        if (previousStatus === 'translating' && segment.status === 'ready') {
          showTranslationSuccessFeedback(segment.sourceBlockId);
        }
        if (segment.status === 'ready') clearedBlockIds.delete(segment.sourceBlockId);
        else clearedBlockIds.add(segment.sourceBlockId);
      }
      if (clearedBlockIds.size > 0) clearTranslationSuccessFeedback(clearedBlockIds);
    },
    [clearTranslationSuccessFeedback, showTranslationSuccessFeedback],
  );

  const session = useSourceBilingualTranslation({
    articleId: article.id,
    contentKind: 'article',
    onTranslationReceived: receiveTranslation,
    surface: translationSurface,
    targetLanguage,
    translationAnnotations,
  });
  const nextHtml = session.surfaceOutput ?? contentHtml;
  if (nextHtml !== view.latestHtml) {
    // A replaced article body would drop the reader's selection, so new html waits for it.
    dispatch({
      type: 'htmlArrived',
      html: nextHtml,
      selectionActive: !view.frozen && shouldFreezeWebArticleHtml(articleRef.current),
    });
  }
  const renderedHtml = view.shownHtml;
  const isSelectionDisabled = session.visible && session.translationInProgress;

  const debugContext = useEffectEvent(() => ({
    translationVisible: session.visible,
    hasTranslation: Boolean(session.translation),
    translationStatus: session.translation?.status ?? null,
    translationSegmentCount: session.translation?.segments.length ?? 0,
    articleHtmlFrozen: view.frozen,
    pendingArticleHtml: view.frozen && view.latestHtml !== view.shownHtml,
    translationSelectionDisabled: isSelectionDisabled,
  }));
  const readView = useEffectEvent(() => view);
  const readTranslation = useEffectEvent(() => session.translation);

  const flushHtmlRendering = useCallback((reason: string) => {
    const { latestHtml, shownHtml } = readView();
    dispatch({ type: 'selectionFinished' });
    if (latestHtml === shownHtml) return;
    logReaderSelectionDebug('article-html:flush', () => ({
      ...debugContext(),
      reason,
      htmlChars: latestHtml.length,
    }));
  }, []);

  const finishSelection = useCallback(
    (reason: string) => {
      if (htmlRenderFlushTimerRef.current) {
        window.clearTimeout(htmlRenderFlushTimerRef.current);
      }
      htmlRenderFlushTimerRef.current = window.setTimeout(() => {
        htmlRenderFlushTimerRef.current = null;
        flushHtmlRendering(reason);
      }, 0);
    },
    [flushHtmlRendering],
  );

  const startSelection = useCallback((reason: string) => {
    const { frozen, shownHtml } = readView();
    if (frozen) return;
    dispatch({ type: 'selectionStarted' });
    if (htmlRenderFlushTimerRef.current) {
      window.clearTimeout(htmlRenderFlushTimerRef.current);
      htmlRenderFlushTimerRef.current = null;
    }
    logReaderSelectionDebug('article-html:freeze', () => ({
      ...debugContext(),
      reason,
      htmlChars: shownHtml.length,
    }));
  }, []);

  const logArticleRendered = useCallback(
    (marker: HTMLElement | null) => {
      const articleElement = articleRef.current;
      if (!marker || !articleElement) return;
      const { shownHtml } = readView();
      const translation = readTranslation();
      logReaderSelectionDebug('article-dom:rendered', () => ({
        ...debugContext(),
        contentHtmlChars: shownHtml.length,
        renderedTranslationStatus: translation?.status ?? null,
        renderedTranslationSegmentCount: translation?.segments.length ?? 0,
        dom: describeArticleTranslationDom(articleElement),
      }));
    },
    [articleRef],
  );

  useMountEffect(() => () => {
    if (htmlRenderFlushTimerRef.current) {
      window.clearTimeout(htmlRenderFlushTimerRef.current);
      htmlRenderFlushTimerRef.current = null;
    }
    for (const timer of translationSuccessTimerRef.current.values()) window.clearTimeout(timer);
    translationSuccessTimerRef.current.clear();
  });

  const showSelectionDisabledToast = useCallback(() => {
    const now = Date.now();
    if (now - selectionToastAtRef.current < translationSelectionToastThrottleMs) return;
    selectionToastAtRef.current = now;
    appToast.warning(t('readerTranslation.article.translationSelectionDisabledToast'), {
      description: t('readerTranslation.article.translationSelectionDisabledToastDescription'),
    });
  }, [t]);

  return {
    diagnostics: {
      context: debugContext,
    },
    dialog: session.dialog,
    // Rendered after the reader surface, so it logs the article body that was just committed.
    renderedMarker: <span hidden key={renderedHtml} ref={logArticleRendered} />,
    renderedHtml,
    retryBlock: session.retryBlock,
    selection: {
      finish: finishSelection,
      isDisabled: isSelectionDisabled,
      showDisabledToast: showSelectionDisabledToast,
      start: startSelection,
    },
    toolbar: session.toolbar,
  };
}

function shouldFreezeWebArticleHtml(articleElement: HTMLElement | null) {
  if (!articleElement) return false;
  const selection = getArticleSelection(articleElement);
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
  return isRangeInsideArticle(selection.getRangeAt(0), articleElement);
}

function translationAnnotationsForBlocks(annotations: Annotation[], blockIds: ReadonlySet<string>) {
  return annotations.filter(
    (annotation) => annotation.anchor.segmentId && blockIds.has(annotation.anchor.segmentId),
  );
}

function translationBlockElement(root: HTMLElement, selector: string, blockId: string) {
  return Array.from(root.querySelectorAll<HTMLElement>(selector)).find(
    (element) =>
      element.getAttribute('data-reader-translation-block-id') === blockId ||
      element.getAttribute('data-reader-source-block-id') === blockId,
  );
}
