import { useCallback, useEffect, useRef, useState } from 'react';
import type { ArticleTranslation } from '@yomitomo/shared';
import {
  applyBilingualTranslation,
  clearBilingualTranslation,
  extractBilingualTranslationBlocks,
} from '@yomitomo/core';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { appToast } from '../../shell/app-toast';
import type { EbookArticleRecord } from '../bookcase/app-source-bookcase-shared';
import {
  ReaderTranslationConfirmDialog,
  ReaderTranslationToolbarButton,
  type TranslationConfirmAction,
} from '../bookcase/reader-translation-controls';
import {
  currentFoliateContent,
  currentFoliateContents,
  ebookChapterForFoliateSection,
  type FoliateViewElement,
} from './app-ebook-reader-utils';
import { useTranslation } from 'react-i18next';

type ActiveEbookTranslationSource = {
  doc: Document;
  sourceId: string;
};

type TranslationRequestOptions = {
  force?: boolean;
  sourceBlockIds?: string[];
};

type UseEbookBilingualTranslationInput = {
  article: EbookArticleRecord;
  style: string;
  targetLanguage?: string;
  onLayoutChange: () => void;
};

export function useEbookBilingualTranslation({
  article,
  style,
  targetLanguage,
  onLayoutChange,
}: UseEbookBilingualTranslationInput) {
  const { t } = useTranslation();
  const activeSourceRef = useRef<ActiveEbookTranslationSource | null>(null);
  const activeDocumentCleanupRef = useRef<() => void>(() => {});
  const loadTokenRef = useRef(0);
  const requestTranslationRef = useRef<(options?: TranslationRequestOptions) => Promise<void>>(
    async () => {},
  );
  const toastIdRef = useRef<string | number | null>(null);
  const [activeRevision, setActiveRevision] = useState(0);
  const [activeSourceId, setActiveSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TranslationConfirmAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [visible, setVisible] = useState(false);
  const supported = article.ebook.metadata.format === 'epub';
  const translationInProgress = busy || translation?.status === 'translating';

  const receiveTranslation = useCallback(
    (nextTranslation: ArticleTranslation) => {
      if (
        nextTranslation.articleId !== article.id ||
        nextTranslation.sourceId !== activeSourceRef.current?.sourceId
      ) {
        return;
      }
      setTranslation(nextTranslation);
      setVisible(true);
    },
    [article.id],
  );

  const dismissToast = useCallback(() => {
    if (toastIdRef.current === null) return;
    appToast.dismiss(toastIdRef.current);
    toastIdRef.current = null;
  }, []);

  const finishToast = useCallback(
    (nextTranslation: ArticleTranslation) => {
      dismissToast();
      const failed = nextTranslation.segments.filter(
        (segment) => segment.status === 'failed',
      ).length;
      if (failed > 0) {
        appToast.warning(t('ebookReader.translationCompleteWithFailures', { count: failed }));
        return;
      }
      appToast.success(t('ebookReader.translationReady'));
    },
    [dismissToast, t],
  );

  const requestTranslation = useCallback(
    async (options: TranslationRequestOptions = {}) => {
      const activeSource = activeSourceRef.current;
      if (!activeSource || busy) return;
      if (!options.force && !options.sourceBlockIds?.length && translation && !visible) {
        setVisible(true);
        return;
      }

      const blocks = extractBilingualTranslationBlocks(activeSource.doc.body);
      if (blocks.length === 0) {
        appToast.error(t('ebookReader.translationNoText'));
        return;
      }
      const requestedSourceId = activeSource.sourceId;
      setVisible(true);
      setBusy(true);
      dismissToast();
      toastIdRef.current = appToast.info(t('ebookReader.translatingChapter'), {
        duration: Infinity,
      });

      try {
        const nextTranslation = await window.yomitomoDesktop.translateArticle({
          articleId: article.id,
          force: options.force,
          sourceBlockIds: options.sourceBlockIds,
          sourceBlocks: blocks.map(({ id, text }) => ({ id, text })),
          sourceId: requestedSourceId,
          targetLanguage,
        });
        if (activeSourceRef.current?.sourceId === requestedSourceId) {
          receiveTranslation(nextTranslation);
        }
        finishToast(nextTranslation);
      } catch (error) {
        dismissToast();
        appToast.error(assistantRuntimeErrorMessage(error, 'ebookReader.translationFailed'));
      } finally {
        setBusy(false);
      }
    },
    [
      article.id,
      busy,
      dismissToast,
      finishToast,
      receiveTranslation,
      t,
      targetLanguage,
      translation,
      visible,
    ],
  );
  requestTranslationRef.current = requestTranslation;

  const loadCurrentTranslation = useCallback(
    async (activeSource: ActiveEbookTranslationSource) => {
      const token = ++loadTokenRef.current;
      try {
        const current = await window.yomitomoDesktop.getCurrentArticleTranslation({
          articleId: article.id,
          sourceId: activeSource.sourceId,
          targetLanguage,
        });
        if (
          token !== loadTokenRef.current ||
          activeSourceRef.current?.sourceId !== activeSource.sourceId
        ) {
          return;
        }
        setTranslation(current);
        setVisible(Boolean(current));
      } catch {
        if (token === loadTokenRef.current) setTranslation(null);
      }
    },
    [article.id, targetLanguage],
  );

  const attachFoliateDocument = useCallback(
    (view: FoliateViewElement | null) => {
      if (!supported || !view) return;
      const activeSource = ebookTranslationSourceForView(article, view);
      if (!activeSource) return;
      const current = activeSourceRef.current;
      if (current?.doc === activeSource.doc && current.sourceId === activeSource.sourceId) return;

      activeDocumentCleanupRef.current();
      activeSourceRef.current = activeSource;
      setActiveSourceId(activeSource.sourceId);
      setActiveRevision((revision) => revision + 1);
      setConfirmAction(null);
      setMenuOpen(false);
      setTranslation(null);
      setVisible(false);

      const handleClick = (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target : null;
        const retryButton = target?.closest<HTMLElement>(
          '[data-reader-translation-action="failed"]',
        );
        if (!retryButton) return;
        const sourceBlockId = retryButton.dataset.readerTranslationBlockId;
        if (!sourceBlockId) return;
        event.preventDefault();
        event.stopPropagation();
        void requestTranslationRef.current({ sourceBlockIds: [sourceBlockId] });
      };
      activeSource.doc.addEventListener('click', handleClick);
      activeDocumentCleanupRef.current = () =>
        activeSource.doc.removeEventListener('click', handleClick);
      void loadCurrentTranslation(activeSource);
    },
    [article, loadCurrentTranslation, supported],
  );

  const cleanupFoliateDocument = useCallback(() => {
    loadTokenRef.current += 1;
    activeDocumentCleanupRef.current();
    activeDocumentCleanupRef.current = () => {};
    activeSourceRef.current = null;
  }, []);

  useEffect(() => {
    const activeSource = activeSourceRef.current;
    if (!activeSource) return;
    setTranslation(null);
    setVisible(false);
    void loadCurrentTranslation(activeSource);
  }, [loadCurrentTranslation]);

  useEffect(() => {
    setActiveSourceId('');
    setConfirmAction(null);
    setMenuOpen(false);
    setTranslation(null);
    setVisible(false);
  }, [article.id]);

  useEffect(() => {
    const subscribe = (window.yomitomoDesktop as Partial<typeof window.yomitomoDesktop> | undefined)
      ?.onArticleTranslationUpdated;
    if (!subscribe) return;
    return subscribe((nextTranslation) => {
      if (nextTranslation.articleId !== article.id) return;
      receiveTranslation(nextTranslation);
    });
  }, [article.id, receiveTranslation]);

  useEffect(() => {
    const activeSource = activeSourceRef.current;
    if (!activeSource || activeSource.sourceId !== activeSourceId) return;
    const root = activeSource.doc.body;
    return runWhenEbookSelectionSettles(activeSource.doc, () => {
      const changed = visible
        ? applyBilingualTranslation(root, translation, {
            retryLabel: t('ebookReader.retryTranslationSegment'),
            style,
          })
        : clearBilingualTranslation(root);
      if (!changed) return;
      activeSource.doc.defaultView?.requestAnimationFrame?.(() => onLayoutChange());
    });
  }, [activeRevision, activeSourceId, onLayoutChange, style, t, translation, visible]);

  useEffect(
    () => () => {
      cleanupFoliateDocument();
      dismissToast();
    },
    [cleanupFoliateDocument, dismissToast],
  );

  const deleteTranslation = useCallback(async () => {
    const sourceId = activeSourceRef.current?.sourceId;
    if (!sourceId || busy) return;
    setBusy(true);
    try {
      await window.yomitomoDesktop.deleteCurrentArticleTranslation({
        articleId: article.id,
        sourceId,
        targetLanguage,
      });
      if (activeSourceRef.current?.sourceId === sourceId) {
        setTranslation(null);
        setVisible(false);
        setMenuOpen(false);
      }
    } catch (error) {
      appToast.error(assistantRuntimeErrorMessage(error, 'ebookReader.deleteTranslationFailed'));
    } finally {
      setBusy(false);
    }
  }, [article.id, busy, targetLanguage]);

  const toolbar =
    supported && activeSourceId ? (
      <ReaderTranslationToolbarButton
        busy={translationInProgress}
        hasTranslation={Boolean(translation)}
        labels={{
          deleteTranslation: t('ebookReader.deleteTranslation'),
          hideTranslation: t('ebookReader.hideTranslation'),
          retranslate: t('ebookReader.retranslateChapter'),
          showTranslation: t('ebookReader.showTranslation'),
          translate: t('ebookReader.translateChapter'),
        }}
        menuOpen={menuOpen}
        visible={visible}
        onConfirm={setConfirmAction}
        onMenuOpenChange={setMenuOpen}
        onSetVisible={setVisible}
      />
    ) : null;

  const dialog = supported ? (
    <ReaderTranslationConfirmDialog
      action={confirmAction}
      annotationNotice=""
      labels={{
        cancel: t('common.cancel'),
        confirmDeleteTranslation: t('ebookReader.confirmDeleteTranslation'),
        confirmDeleteTranslationDescription: t('ebookReader.confirmDeleteTranslationDescription'),
        confirmDeleteTranslationTitle: t('ebookReader.confirmDeleteTranslationTitle'),
        confirmRetranslate: t('ebookReader.confirmRetranslate'),
        confirmRetranslateDescription: t('ebookReader.confirmRetranslateDescription'),
        confirmRetranslateTitle: t('ebookReader.confirmRetranslateTitle'),
        confirmTranslate: t('ebookReader.confirmTranslate'),
        confirmTranslateDescription: t('ebookReader.confirmTranslateDescription'),
        confirmTranslateTitle: t('ebookReader.confirmTranslateTitle'),
      }}
      onClose={() => setConfirmAction(null)}
      onConfirm={async (action) => {
        setConfirmAction(null);
        if (action === 'delete') await deleteTranslation();
        else await requestTranslation({ force: action === 'retranslate' });
      }}
    />
  ) : null;

  return {
    attachFoliateDocument,
    cleanupFoliateDocument,
    dialog,
    toolbar,
  };
}

export function ebookTranslationSourceForView(
  article: EbookArticleRecord,
  view: FoliateViewElement,
): ActiveEbookTranslationSource | null {
  const pageInfo = view.getPageInfo?.();
  const currentContent = currentFoliateContent(view);
  const sectionIndex = pageInfo?.sectionIndex ?? currentContent?.index;
  if (sectionIndex === undefined) return null;
  const content =
    currentFoliateContents(view).find((candidate) => candidate.index === sectionIndex) ??
    currentContent;
  const doc = content?.doc;
  const chapter = ebookChapterForFoliateSection(article, view, sectionIndex);
  if (!doc?.body || !chapter) return null;
  return {
    doc,
    sourceId: chapter.id,
  };
}

export function runWhenEbookSelectionSettles(doc: Document, mutation: () => void) {
  let active = true;
  const run = () => {
    if (!active) return;
    const selection = doc.getSelection();
    if (selection && !selection.isCollapsed) return;
    active = false;
    doc.removeEventListener('selectionchange', run);
    mutation();
  };
  doc.addEventListener('selectionchange', run);
  run();
  return () => {
    active = false;
    doc.removeEventListener('selectionchange', run);
  };
}
