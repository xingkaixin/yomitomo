import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
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

type WebArticleHtmlRenderState = {
  articleId: string;
  frozen: boolean;
  html: string;
  pendingHtml: string | null;
};

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
  const annotationsRef = useRef(annotations);
  annotationsRef.current = annotations;
  const htmlRenderRef = useRef<WebArticleHtmlRenderState>({
    articleId: '',
    frozen: false,
    html: '',
    pendingHtml: null,
  });
  const htmlRenderFlushTimerRef = useRef<number | null>(null);
  const translationSegmentStatusRef = useRef(
    new Map<string, ArticleTranslation['segments'][number]['status']>(),
  );
  const translationSuccessTimerRef = useRef(new Map<string, number>());
  const selectionToastAtRef = useRef(0);
  const debugContextRef = useRef<Record<string, unknown>>({});
  const [htmlRenderVersion, forceHtmlRender] = useState(0);
  const [translationSuccessBlockIds, setTranslationSuccessBlockIds] = useState<Set<string>>(
    () => new Set(),
  );

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

  const translationSurface = useMemo<TranslationSurfaceAdapter<string>>(
    () => ({
      applyTranslation: (translation, visible) => {
        const successBlockIds =
          translation?.status === 'translating'
            ? emptyTranslationSuccessBlockIds
            : translationSuccessBlockIds;
        const nextHtml =
          visible && translation
            ? articleHtmlWithBilingualTranslation(document, contentHtml, translation, {
                retryLabel: t('readerTranslation.common.retryTranslationSegment'),
                style,
                successBlockIds,
              })
            : contentHtml;
        if (shouldFreezeWebArticleHtml(articleRef.current)) {
          htmlRenderRef.current.frozen = true;
        }
        return webArticleHtmlForRender(htmlRenderRef.current, article.id, nextHtml);
      },
      extractBlocks: () =>
        extractWebArticleTranslationBlocks(document, contentHtml).map(({ id, text }) => ({
          id,
          text,
        })),
      scrollToBlock: scrollTranslationBlockIntoView,
    }),
    [
      article.id,
      articleRef,
      contentHtml,
      htmlRenderVersion,
      scrollTranslationBlockIntoView,
      style,
      t,
      translationSuccessBlockIds,
    ],
  );

  const countTranslationAnnotations = useCallback(
    (blockIds: ReadonlySet<string>) =>
      translationAnnotationsForBlocks(annotations, blockIds).length,
    [annotations],
  );
  const removeTranslationAnnotations = useCallback(
    async (blockIds: ReadonlySet<string>) => {
      const affected = translationAnnotationsForBlocks(annotationsRef.current, blockIds);
      for (const annotation of affected) await deleteAnnotation(annotation.id);
    },
    [deleteAnnotation],
  );
  const translationAnnotations = useMemo(
    () => ({
      count: countTranslationAnnotations,
      remove: removeTranslationAnnotations,
    }),
    [countTranslationAnnotations, removeTranslationAnnotations],
  );
  const session = useSourceBilingualTranslation({
    articleId: article.id,
    contentKind: 'article',
    surface: translationSurface,
    targetLanguage,
    translationAnnotations,
  });
  const renderedHtml = session.surfaceOutput ?? contentHtml;
  const isSelectionDisabled = session.visible && session.translationInProgress;

  debugContextRef.current = {
    translationVisible: session.visible,
    hasTranslation: Boolean(session.translation),
    translationStatus: session.translation?.status ?? null,
    translationSegmentCount: session.translation?.segments.length ?? 0,
    articleHtmlFrozen: htmlRenderRef.current.frozen,
    pendingArticleHtml: Boolean(htmlRenderRef.current.pendingHtml),
    translationSelectionDisabled: isSelectionDisabled,
  };

  const clearTranslationSuccessFeedback = useCallback((blockId?: string) => {
    if (blockId) {
      const timer = translationSuccessTimerRef.current.get(blockId);
      if (timer) window.clearTimeout(timer);
      translationSuccessTimerRef.current.delete(blockId);
      setTranslationSuccessBlockIds((current) => {
        if (!current.has(blockId)) return current;
        const next = new Set(current);
        next.delete(blockId);
        return next;
      });
      return;
    }

    for (const timer of translationSuccessTimerRef.current.values()) window.clearTimeout(timer);
    translationSuccessTimerRef.current.clear();
    setTranslationSuccessBlockIds((current) => (current.size === 0 ? current : new Set()));
  }, []);

  const showTranslationSuccessFeedback = useCallback((blockId: string) => {
    const previousTimer = translationSuccessTimerRef.current.get(blockId);
    if (previousTimer) window.clearTimeout(previousTimer);
    setTranslationSuccessBlockIds((current) => new Set(current).add(blockId));
    const nextTimer = window.setTimeout(() => {
      translationSuccessTimerRef.current.delete(blockId);
      setTranslationSuccessBlockIds((current) => {
        if (!current.has(blockId)) return current;
        const next = new Set(current);
        next.delete(blockId);
        return next;
      });
    }, translationSuccessFeedbackDurationMs);
    translationSuccessTimerRef.current.set(blockId, nextTimer);
  }, []);

  const flushHtmlRendering = useCallback((reason: string) => {
    const renderState = htmlRenderRef.current;
    const pendingHtml = renderState.pendingHtml;
    renderState.frozen = false;
    renderState.pendingHtml = null;
    if (!pendingHtml || pendingHtml === renderState.html) return;

    renderState.html = pendingHtml;
    logReaderSelectionDebug('article-html:flush', () => ({
      ...debugContextRef.current,
      reason,
      htmlChars: pendingHtml.length,
    }));
    forceHtmlRender((version) => version + 1);
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
    const renderState = htmlRenderRef.current;
    if (renderState.frozen) return;
    renderState.frozen = true;
    if (htmlRenderFlushTimerRef.current) {
      window.clearTimeout(htmlRenderFlushTimerRef.current);
      htmlRenderFlushTimerRef.current = null;
    }
    logReaderSelectionDebug('article-html:freeze', () => ({
      ...debugContextRef.current,
      reason,
      htmlChars: renderState.html.length,
    }));
  }, []);

  useEffect(() => {
    clearTranslationSuccessFeedback();
    translationSegmentStatusRef.current.clear();
  }, [article.id, clearTranslationSuccessFeedback]);

  useEffect(() => {
    const previousStatuses = translationSegmentStatusRef.current;
    const nextStatuses = new Map<string, ArticleTranslation['segments'][number]['status']>();

    for (const segment of session.translation?.segments || []) {
      nextStatuses.set(segment.sourceBlockId, segment.status);
      const previousStatus = previousStatuses.get(segment.sourceBlockId);
      if (previousStatus === 'translating' && segment.status === 'ready') {
        showTranslationSuccessFeedback(segment.sourceBlockId);
      }
      if (segment.status !== 'ready') clearTranslationSuccessFeedback(segment.sourceBlockId);
    }

    for (const blockId of previousStatuses.keys()) {
      if (!nextStatuses.has(blockId)) clearTranslationSuccessFeedback(blockId);
    }
    translationSegmentStatusRef.current = nextStatuses;
  }, [clearTranslationSuccessFeedback, session.translation, showTranslationSuccessFeedback]);

  useEffect(() => {
    const articleElement = articleRef.current;
    if (!articleElement) return;
    logReaderSelectionDebug('article-dom:rendered', () => ({
      ...debugContextRef.current,
      contentHtmlChars: renderedHtml.length,
      renderedTranslationStatus: session.translation?.status ?? null,
      renderedTranslationSegmentCount: session.translation?.segments.length ?? 0,
      dom: describeArticleTranslationDom(articleElement),
    }));
  }, [articleRef, renderedHtml, session.translation]);

  useEffect(
    () => () => {
      if (htmlRenderFlushTimerRef.current) {
        window.clearTimeout(htmlRenderFlushTimerRef.current);
        htmlRenderFlushTimerRef.current = null;
      }
      clearTranslationSuccessFeedback();
    },
    [clearTranslationSuccessFeedback],
  );

  const showSelectionDisabledToast = useCallback(() => {
    const now = Date.now();
    if (now - selectionToastAtRef.current < translationSelectionToastThrottleMs) return;
    selectionToastAtRef.current = now;
    appToast.warning(t('readerTranslation.article.translationSelectionDisabledToast'), {
      description: t('readerTranslation.article.translationSelectionDisabledToastDescription'),
    });
  }, [t]);

  const debugContext = useCallback(() => debugContextRef.current, []);

  return {
    diagnostics: {
      context: debugContext,
    },
    dialog: session.dialog,
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

function webArticleHtmlForRender(
  state: WebArticleHtmlRenderState,
  articleId: string,
  nextHtml: string,
) {
  if (state.articleId !== articleId) {
    state.articleId = articleId;
    state.frozen = false;
    state.html = nextHtml;
    state.pendingHtml = null;
    return state.html;
  }

  if (state.frozen) {
    if (state.html !== nextHtml) state.pendingHtml = nextHtml;
    return state.html;
  }

  state.html = nextHtml;
  state.pendingHtml = null;
  return state.html;
}
