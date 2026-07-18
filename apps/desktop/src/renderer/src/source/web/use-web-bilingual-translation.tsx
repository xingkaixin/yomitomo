import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { Annotation, ArticleRecord, ArticleTranslation } from '@yomitomo/shared';
import {
  articleHtmlWithBilingualTranslation,
  getArticleSelection,
  isRangeInsideArticle,
  scrollReaderSurfaceToRect,
} from '@yomitomo/core';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { appToast } from '../../shell/app-toast';
import {
  ReaderTranslationConfirmDialog,
  ReaderTranslationToolbarButton,
  type TranslationConfirmAction,
} from '../bookcase/reader-translation-controls';
import {
  describeArticleTranslationDom,
  logReaderSelectionDebug,
} from './web-reader-selection-debug';
import { useWebTranslationProgressToast } from './use-web-translation-progress-toast';

const translationSelectionToastThrottleMs = 2000;
const translationSuccessFeedbackDurationMs = 2000;
const emptyTranslationSuccessBlockIds = new Set<string>();

type WebArticleHtmlRenderState = {
  articleId: string;
  frozen: boolean;
  html: string;
  pendingHtml: string | null;
};

type WebTranslationRequestOptions = {
  force?: boolean;
  sourceBlockIds?: string[];
};

type WebTranslationUpdateReason = 'initial-load' | 'request' | 'subscription';

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
  const loadTokenRef = useRef(0);
  const selectionGestureActiveRef = useRef(false);
  const deferredTranslationRef = useRef<ArticleTranslation | null>(null);
  const translationSegmentStatusRef = useRef(
    new Map<string, ArticleTranslation['segments'][number]['status']>(),
  );
  const translationSuccessTimerRef = useRef(new Map<string, number>());
  const selectionToastAtRef = useRef(0);
  const requestTranslationRef = useRef<(options?: WebTranslationRequestOptions) => Promise<void>>(
    async () => {},
  );
  const debugContextRef = useRef<Record<string, unknown>>({});
  const [, forceHtmlRender] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TranslationConfirmAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [translationSuccessBlockIds, setTranslationSuccessBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [visible, setVisible] = useState(false);
  const translationInProgress = busy || translation?.status === 'translating';
  const isSelectionDisabled = visible && translationInProgress;

  const scrollTranslationBlockIntoView = useCallback(
    (blockId: string) => {
      const articleElement = articleRef.current;
      const scrollElement = scrollRef.current;
      if (!articleElement || !scrollElement) return;
      const target = Array.from(
        articleElement.querySelectorAll<HTMLElement>('[data-reader-translation-block-id]'),
      ).find((element) => element.getAttribute('data-reader-translation-block-id') === blockId);
      const source = Array.from(
        articleElement.querySelectorAll<HTMLElement>('[data-reader-source-block-id]'),
      ).find((element) => element.getAttribute('data-reader-source-block-id') === blockId);
      const element = target || source;
      if (!element) return;
      scrollReaderSurfaceToRect(scrollElement, element.getBoundingClientRect(), 82);
      if (target instanceof HTMLButtonElement) target.focus();
    },
    [articleRef, scrollRef],
  );

  const revealFirstFailedTranslationSegment = useCallback(
    (nextTranslation: ArticleTranslation) => {
      const blockId = nextTranslation.segments.find(
        (segment) => segment.status === 'failed',
      )?.sourceBlockId;
      if (!blockId) return;
      setVisible(true);
      window.requestAnimationFrame(() => scrollTranslationBlockIntoView(blockId));
    },
    [scrollTranslationBlockIntoView],
  );

  const progressToast = useWebTranslationProgressToast({
    onRevealFirstFailedTranslationSegment: revealFirstFailedTranslationSegment,
    t,
  });

  const renderedTranslation = translation?.articleId === article.id ? translation : null;
  const renderedSuccessBlockIds =
    translation?.status === 'translating'
      ? emptyTranslationSuccessBlockIds
      : translationSuccessBlockIds;
  const computedHtml = useMemo(() => {
    if (!visible || !renderedTranslation) return contentHtml;
    return articleHtmlWithBilingualTranslation(document, contentHtml, renderedTranslation, {
      retryLabel: t('source.retryTranslationSegment'),
      style,
      successBlockIds: renderedSuccessBlockIds,
    });
  }, [contentHtml, renderedSuccessBlockIds, renderedTranslation, style, t, visible]);
  const renderedHtml = webArticleHtmlForRender(htmlRenderRef.current, article.id, computedHtml);

  debugContextRef.current = {
    translationVisible: visible,
    hasTranslation: Boolean(translation),
    translationStatus: translation?.status ?? null,
    translationSegmentCount: translation?.segments.length ?? 0,
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

  const shouldDeferTranslationUpdate = useCallback(() => {
    if (selectionGestureActiveRef.current) return true;
    const articleElement = articleRef.current;
    if (!articleElement) return false;
    const nativeSelection = getArticleSelection(articleElement);
    if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
      return false;
    }
    return isRangeInsideArticle(nativeSelection.getRangeAt(0), articleElement);
  }, [articleRef]);

  const receiveTranslation = useCallback(
    (nextTranslation: ArticleTranslation, reason: WebTranslationUpdateReason) => {
      if (nextTranslation.articleId !== article.id) return;
      if (reason !== 'initial-load') loadTokenRef.current += 1;
      progressToast.update(nextTranslation);
      if (shouldDeferTranslationUpdate()) {
        deferredTranslationRef.current = nextTranslation;
        logReaderSelectionDebug('translation-update:deferred', {
          ...debugContextRef.current,
          reason,
          latestUpdatedAt: nextTranslation.updatedAt,
          latestStatus: nextTranslation.status,
          latestReadySegmentCount: nextTranslation.segments.filter(
            (segment) => segment.status === 'ready',
          ).length,
        });
        return;
      }

      setTranslation(nextTranslation);
      setVisible(true);
    },
    [article.id, progressToast, shouldDeferTranslationUpdate],
  );

  const flushDeferredTranslation = useCallback((reason: string) => {
    selectionGestureActiveRef.current = false;
    const pendingTranslation = deferredTranslationRef.current;
    deferredTranslationRef.current = null;
    if (!pendingTranslation) return;

    logReaderSelectionDebug('translation-update:flushed', {
      ...debugContextRef.current,
      reason,
      latestUpdatedAt: pendingTranslation.updatedAt,
      latestStatus: pendingTranslation.status,
      latestReadySegmentCount: pendingTranslation.segments.filter(
        (segment) => segment.status === 'ready',
      ).length,
    });
    setTranslation(pendingTranslation);
    setVisible(true);
  }, []);

  const flushHtmlRendering = useCallback((reason: string) => {
    const renderState = htmlRenderRef.current;
    const pendingHtml = renderState.pendingHtml;
    renderState.frozen = false;
    renderState.pendingHtml = null;
    if (!pendingHtml || pendingHtml === renderState.html) return;

    renderState.html = pendingHtml;
    logReaderSelectionDebug('article-html:flush', {
      ...debugContextRef.current,
      reason,
      htmlChars: pendingHtml.length,
    });
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
        flushDeferredTranslation(reason);
      }, 0);
    },
    [flushDeferredTranslation, flushHtmlRendering],
  );

  const startSelection = useCallback((reason: string) => {
    const renderState = htmlRenderRef.current;
    selectionGestureActiveRef.current = true;
    if (renderState.frozen) return;
    renderState.frozen = true;
    if (htmlRenderFlushTimerRef.current) {
      window.clearTimeout(htmlRenderFlushTimerRef.current);
      htmlRenderFlushTimerRef.current = null;
    }
    logReaderSelectionDebug('article-html:freeze', {
      ...debugContextRef.current,
      reason,
      htmlChars: renderState.html.length,
    });
  }, []);

  const deleteTranslationAnnotations = useCallback(
    async (blockIds: Set<string>) => {
      // Translated-text annotations are anchored to generated segments and cannot survive regeneration.
      const affected = translationAnnotationsForBlocks(annotationsRef.current, blockIds);
      for (const annotation of affected) await deleteAnnotation(annotation.id);
    },
    [deleteAnnotation],
  );

  const requestTranslation = useCallback(
    async (options: WebTranslationRequestOptions = {}) => {
      if (busy) return;
      if (!options.force && !options.sourceBlockIds?.length && translation && !visible) {
        setVisible(true);
        return;
      }
      setVisible(true);
      setBusy(true);
      loadTokenRef.current += 1;
      progressToast.start();
      const translationTask = (async () => {
        const retranslatedBlockIds = options.force
          ? currentTranslationBlockIds(translation)
          : options.sourceBlockIds?.length
            ? new Set(options.sourceBlockIds)
            : null;
        if (retranslatedBlockIds) await deleteTranslationAnnotations(retranslatedBlockIds);
        const nextTranslation = await window.yomitomoDesktop.translateArticle({
          articleId: article.id,
          force: options.force,
          sourceBlockIds: options.sourceBlockIds,
          targetLanguage,
        });
        receiveTranslation(nextTranslation, 'request');
        return nextTranslation;
      })();
      try {
        progressToast.finish(await translationTask);
      } catch (error) {
        progressToast.fail(error);
      } finally {
        setBusy(false);
      }
    },
    [
      article.id,
      busy,
      deleteTranslationAnnotations,
      progressToast,
      receiveTranslation,
      targetLanguage,
      translation,
      visible,
    ],
  );
  requestTranslationRef.current = requestTranslation;

  const deleteTranslation = useCallback(async () => {
    if (busy) return;
    loadTokenRef.current += 1;
    try {
      await deleteTranslationAnnotations(currentTranslationBlockIds(translation));
      await window.yomitomoDesktop.deleteCurrentArticleTranslation({
        articleId: article.id,
        targetLanguage,
      });
      deferredTranslationRef.current = null;
      progressToast.dismiss();
      setTranslation(null);
      setVisible(false);
      setMenuOpen(false);
    } catch (error) {
      appToast.error(assistantRuntimeErrorMessage(error, 'source.deleteTranslationFailed'));
    }
  }, [article.id, busy, deleteTranslationAnnotations, progressToast, targetLanguage, translation]);

  useEffect(() => {
    setTranslation(null);
    setVisible(false);
    setMenuOpen(false);
    setConfirmAction(null);
    deferredTranslationRef.current = null;
    selectionGestureActiveRef.current = false;
    clearTranslationSuccessFeedback();
    translationSegmentStatusRef.current.clear();
  }, [article.id, clearTranslationSuccessFeedback]);

  useEffect(() => {
    if (article.sourceType !== 'web') return;
    const token = ++loadTokenRef.current;
    void window.yomitomoDesktop
      .getCurrentArticleTranslation({ articleId: article.id, targetLanguage })
      .then((current) => {
        if (token !== loadTokenRef.current) return;
        if (current) receiveTranslation(current, 'initial-load');
        else {
          setTranslation(null);
          setVisible(false);
        }
      })
      .catch(() => {
        if (token === loadTokenRef.current) setTranslation(null);
      });
  }, [article.id, article.sourceType, receiveTranslation, targetLanguage]);

  useEffect(() => {
    const subscribe = (window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop>)
      .onArticleTranslationUpdated;
    if (!subscribe) return;
    return subscribe((nextTranslation) => receiveTranslation(nextTranslation, 'subscription'));
  }, [receiveTranslation]);

  useEffect(() => {
    const previousStatuses = translationSegmentStatusRef.current;
    const nextStatuses = new Map<string, ArticleTranslation['segments'][number]['status']>();

    for (const segment of translation?.segments || []) {
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
  }, [clearTranslationSuccessFeedback, showTranslationSuccessFeedback, translation]);

  useEffect(() => {
    const articleElement = articleRef.current;
    if (!articleElement) return;
    logReaderSelectionDebug('article-dom:rendered', {
      ...debugContextRef.current,
      contentHtmlChars: renderedHtml.length,
      renderedTranslationStatus: renderedTranslation?.status ?? null,
      renderedTranslationSegmentCount: renderedTranslation?.segments.length ?? 0,
      dom: describeArticleTranslationDom(articleElement),
    });
  }, [articleRef, renderedHtml, renderedTranslation]);

  useEffect(
    () => () => {
      if (htmlRenderFlushTimerRef.current) {
        window.clearTimeout(htmlRenderFlushTimerRef.current);
        htmlRenderFlushTimerRef.current = null;
      }
      clearTranslationSuccessFeedback();
      progressToast.dismiss();
    },
    [clearTranslationSuccessFeedback, progressToast],
  );

  const showSelectionDisabledToast = useCallback(() => {
    const now = Date.now();
    if (now - selectionToastAtRef.current < translationSelectionToastThrottleMs) return;
    selectionToastAtRef.current = now;
    appToast.warning(t('source.translationSelectionDisabledToast'), {
      description: t('source.translationSelectionDisabledToastDescription'),
    });
  }, [t]);

  const translationAnnotationCount = useMemo(
    () =>
      translation
        ? translationAnnotationsForBlocks(annotations, currentTranslationBlockIds(translation))
            .length
        : 0,
    [annotations, translation],
  );

  const toolbar = (
    <ReaderTranslationToolbarButton
      busy={translationInProgress}
      hasTranslation={Boolean(translation)}
      labels={{
        deleteTranslation: t('source.deleteTranslation'),
        hideTranslation: t('source.hideTranslation'),
        retranslate: t('source.retranslateArticle'),
        showTranslation: t('source.showTranslation'),
        translate: t('source.translateArticle'),
      }}
      menuOpen={menuOpen}
      visible={visible}
      onConfirm={setConfirmAction}
      onMenuOpenChange={setMenuOpen}
      onSetVisible={setVisible}
    />
  );

  const dialog = (
    <ReaderTranslationConfirmDialog
      action={confirmAction}
      annotationNotice={
        confirmAction && confirmAction !== 'translate' && translationAnnotationCount > 0
          ? t('source.translationAnnotationsRemovalNotice', {
              count: translationAnnotationCount,
            })
          : ''
      }
      labels={{
        cancel: t('common.cancel'),
        confirmDeleteTranslation: t('source.confirmDeleteTranslation'),
        confirmDeleteTranslationDescription: t('source.confirmDeleteTranslationDescription'),
        confirmDeleteTranslationTitle: t('source.confirmDeleteTranslationTitle'),
        confirmRetranslate: t('source.confirmRetranslate'),
        confirmRetranslateDescription: t('source.confirmRetranslateDescription'),
        confirmRetranslateTitle: t('source.confirmRetranslateTitle'),
        confirmTranslate: t('source.confirmTranslate'),
        confirmTranslateDescription: t('source.confirmTranslateDescription'),
        confirmTranslateTitle: t('source.confirmTranslateTitle'),
      }}
      onClose={() => setConfirmAction(null)}
      onConfirm={async (action) => {
        setConfirmAction(null);
        if (action === 'delete') await deleteTranslation();
        else await requestTranslation({ force: action === 'retranslate' });
      }}
    />
  );

  const debugContext = useCallback(() => debugContextRef.current, []);
  const retryBlock = useCallback((blockId: string) => {
    void requestTranslationRef.current({ sourceBlockIds: [blockId] });
  }, []);

  return {
    debugContext,
    dialog,
    renderedHtml,
    retryBlock,
    selection: {
      finish: finishSelection,
      isDisabled: isSelectionDisabled,
      showDisabledToast: showSelectionDisabledToast,
      start: startSelection,
    },
    toolbar,
  };
}

function currentTranslationBlockIds(translation: ArticleTranslation | null) {
  return new Set((translation?.segments || []).map((segment) => segment.sourceBlockId));
}

function translationAnnotationsForBlocks(annotations: Annotation[], blockIds: Set<string>) {
  return annotations.filter(
    (annotation) => annotation.anchor.segmentId && blockIds.has(annotation.anchor.segmentId),
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
