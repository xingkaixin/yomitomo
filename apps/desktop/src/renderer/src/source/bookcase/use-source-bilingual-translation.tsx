import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ArticleTranslation, ArticleTranslationSourceBlockInput } from '@yomitomo/shared';
import { normalizeArticleTranslationTargetLanguage } from '@yomitomo/shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { getDesktopApi, getOptionalDesktopApi } from '../../shell/app-desktop-api';
import { appToast } from '../../shell/app-toast';
import {
  ReaderTranslationConfirmDialog,
  ReaderTranslationToolbarButton,
  type TranslationConfirmAction,
} from './reader-translation-controls';
import { useSourceTranslationProgressToast } from './use-source-translation-progress-toast';

export type TranslationSurfaceAdapter<ApplyResult = unknown> = {
  sourceId?: string;
  applyTranslation: (translation: ArticleTranslation | null, visible: boolean) => ApplyResult;
  extractBlocks: () => ArticleTranslationSourceBlockInput[];
  scrollToBlock: (blockId: string) => void;
};

type TranslationAnnotationsAdapter = {
  count: (blockIds: ReadonlySet<string>) => number;
  remove: (blockIds: ReadonlySet<string>) => Promise<void>;
};

type TranslationContentKind = 'article' | 'chapter';

type TranslationRequestOptions = {
  force?: boolean;
  sourceBlockIds?: string[];
};

type UseSourceBilingualTranslationInput<ApplyResult> = {
  articleId: string;
  contentKind: TranslationContentKind;
  surface: TranslationSurfaceAdapter<ApplyResult> | null;
  targetLanguage?: string;
  translationAnnotations?: TranslationAnnotationsAdapter;
};

export function useSourceBilingualTranslation<ApplyResult>({
  articleId,
  contentKind,
  surface,
  targetLanguage,
  translationAnnotations,
}: UseSourceBilingualTranslationInput<ApplyResult>) {
  const { t } = useTranslation();
  const surfaceRef = useRef(surface);
  const articleIdRef = useRef(articleId);
  const targetLanguageRef = useRef(targetLanguage);
  const translationAnnotationsRef = useRef(translationAnnotations);
  const loadTokenRef = useRef(0);
  const operationTokenRef = useRef(0);
  const requestTranslationRef = useRef<(options?: TranslationRequestOptions) => Promise<void>>(
    async () => {},
  );
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TranslationConfirmAction | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [translation, setTranslation] = useState<ArticleTranslation | null>(null);
  const [visible, setVisible] = useState(false);
  surfaceRef.current = surface;
  articleIdRef.current = articleId;
  targetLanguageRef.current = targetLanguage;
  translationAnnotationsRef.current = translationAnnotations;

  const sourceId = surface?.sourceId;
  const hasSurface = Boolean(surface);
  const contentLabels = translationContentLabels(contentKind, t);

  const revealFirstFailedTranslationSegment = useCallback((nextTranslation: ArticleTranslation) => {
    const blockId = nextTranslation.segments.find(
      (segment) => segment.status === 'failed',
    )?.sourceBlockId;
    if (!blockId) return;
    setVisible(true);
    window.requestAnimationFrame(() => surfaceRef.current?.scrollToBlock(blockId));
  }, []);

  const progressToast = useSourceTranslationProgressToast({
    failureKey: contentLabels.failureKey,
    inProgressDescription: contentLabels.inProgressDescription,
    onRevealFirstFailedTranslationSegment: revealFirstFailedTranslationSegment,
    t,
    translatingLabel: contentLabels.translating,
  });

  const setSessionBusy = useCallback((nextBusy: boolean) => {
    busyRef.current = nextBusy;
    setBusy(nextBusy);
  }, []);

  const receiveTranslation = useCallback(
    (nextTranslation: ArticleTranslation) => {
      if (!hasSurface || !translationMatches(nextTranslation, articleId, sourceId, targetLanguage))
        return;
      progressToast.update(nextTranslation);
      setTranslation(nextTranslation);
      setVisible(true);
    },
    [articleId, hasSurface, progressToast, sourceId, targetLanguage],
  );

  const requestTranslation = useCallback(
    async (options: TranslationRequestOptions = {}) => {
      const activeSurface = surfaceRef.current;
      if (!activeSurface || busyRef.current) return;
      if (!options.force && !options.sourceBlockIds?.length && translation && !visible) {
        setVisible(true);
        return;
      }

      const blocks = activeSurface.extractBlocks();
      if (blocks.length === 0) {
        appToast.error(t(contentLabels.noTextKey));
        return;
      }

      const requestedSourceId = activeSurface.sourceId;
      const operationToken = ++operationTokenRef.current;
      setVisible(true);
      setSessionBusy(true);
      progressToast.start();
      try {
        const replacedBlockIds = options.force
          ? currentTranslationBlockIds(translation)
          : new Set(options.sourceBlockIds || []);
        await translationAnnotationsRef.current?.remove(replacedBlockIds);
        const nextTranslation = await getDesktopApi().article.translation.translate({
          articleId,
          force: options.force,
          sourceBlockIds: options.sourceBlockIds,
          ...(requestedSourceId
            ? {
                sourceBlocks: blocks,
                sourceId: requestedSourceId,
              }
            : {}),
          targetLanguage,
        });
        if (
          operationToken !== operationTokenRef.current ||
          articleIdRef.current !== articleId ||
          targetLanguageRef.current !== targetLanguage ||
          !surfaceRef.current ||
          surfaceRef.current.sourceId !== requestedSourceId
        ) {
          return;
        }
        receiveTranslation(nextTranslation);
        progressToast.finish(nextTranslation);
      } catch (error) {
        if (operationToken === operationTokenRef.current) progressToast.fail(error);
      } finally {
        if (operationToken === operationTokenRef.current) setSessionBusy(false);
      }
    },
    [
      articleId,
      contentLabels.noTextKey,
      progressToast,
      receiveTranslation,
      setSessionBusy,
      t,
      targetLanguage,
      translation,
      visible,
    ],
  );
  requestTranslationRef.current = requestTranslation;

  const deleteTranslation = useCallback(async () => {
    const activeSurface = surfaceRef.current;
    if (!activeSurface || busyRef.current) return;
    const deletedSourceId = activeSurface.sourceId;
    const operationToken = ++operationTokenRef.current;
    setSessionBusy(true);
    try {
      await translationAnnotationsRef.current?.remove(currentTranslationBlockIds(translation));
      await getDesktopApi().article.translation.deleteCurrent({
        articleId,
        ...(deletedSourceId ? { sourceId: deletedSourceId } : {}),
        targetLanguage,
      });
      if (
        operationToken !== operationTokenRef.current ||
        articleIdRef.current !== articleId ||
        targetLanguageRef.current !== targetLanguage ||
        !surfaceRef.current ||
        surfaceRef.current.sourceId !== deletedSourceId
      ) {
        return;
      }
      progressToast.dismiss();
      setTranslation(null);
      setVisible(false);
      setMenuOpen(false);
    } catch (error) {
      if (operationToken === operationTokenRef.current) {
        appToast.error(assistantRuntimeErrorMessage(error, contentLabels.deleteFailureKey));
      }
    } finally {
      if (operationToken === operationTokenRef.current) setSessionBusy(false);
    }
  }, [
    articleId,
    contentLabels.deleteFailureKey,
    progressToast,
    setSessionBusy,
    targetLanguage,
    translation,
  ]);

  useEffect(() => {
    loadTokenRef.current += 1;
    operationTokenRef.current += 1;
    setSessionBusy(false);
    setTranslation(null);
    setVisible(false);
    setMenuOpen(false);
    setConfirmAction(null);
    progressToast.dismiss();
  }, [articleId, hasSurface, progressToast, setSessionBusy, sourceId, targetLanguage]);

  useEffect(() => {
    if (!hasSurface) return;
    const token = ++loadTokenRef.current;
    void getDesktopApi()
      .article.translation.getCurrent({
        articleId,
        ...(sourceId ? { sourceId } : {}),
        targetLanguage,
      })
      .then((current) => {
        if (token !== loadTokenRef.current) return;
        if (current) receiveTranslation(current);
        else {
          setTranslation(null);
          setVisible(false);
        }
      })
      .catch(() => {
        if (token === loadTokenRef.current) setTranslation(null);
      });
  }, [articleId, hasSurface, receiveTranslation, sourceId, targetLanguage]);

  useEffect(() => {
    const subscribe = getOptionalDesktopApi()?.article?.translation?.onUpdated;
    if (!subscribe) return;
    return subscribe(receiveTranslation);
  }, [receiveTranslation]);

  useEffect(() => () => progressToast.dismiss(), [progressToast]);

  const activeTranslation =
    hasSurface &&
    translation &&
    translationMatches(translation, articleId, sourceId, targetLanguage)
      ? translation
      : null;
  const translationInProgress = busy || activeTranslation?.status === 'translating';
  const surfaceOutput = useMemo(
    () => surface?.applyTranslation(activeTranslation, visible) ?? null,
    [activeTranslation, surface, visible],
  );
  const translationAnnotationCount = useMemo(
    () =>
      activeTranslation && translationAnnotations
        ? translationAnnotations.count(currentTranslationBlockIds(activeTranslation))
        : 0,
    [activeTranslation, translationAnnotations],
  );

  const toolbar = hasSurface ? (
    <ReaderTranslationToolbarButton
      busy={translationInProgress}
      hasTranslation={Boolean(activeTranslation)}
      labels={{
        deleteTranslation: contentLabels.deleteTranslation,
        hideTranslation: contentLabels.hideTranslation,
        retranslate: contentLabels.retranslate,
        showTranslation: contentLabels.showTranslation,
        translate: contentLabels.translate,
      }}
      menuOpen={menuOpen}
      visible={visible}
      onConfirm={setConfirmAction}
      onMenuOpenChange={setMenuOpen}
      onSetVisible={setVisible}
    />
  ) : null;

  const dialog = hasSurface ? (
    <ReaderTranslationConfirmDialog
      action={confirmAction}
      annotationNotice={
        confirmAction && confirmAction !== 'translate' && translationAnnotationCount > 0
          ? t('readerTranslation.article.translationAnnotationsRemovalNotice', {
              count: translationAnnotationCount,
            })
          : ''
      }
      labels={{
        cancel: t('common.cancel'),
        confirmDeleteTranslation: contentLabels.confirmDeleteTranslation,
        confirmDeleteTranslationDescription: contentLabels.confirmDeleteTranslationDescription,
        confirmDeleteTranslationTitle: contentLabels.confirmDeleteTranslationTitle,
        confirmRetranslate: contentLabels.confirmRetranslate,
        confirmRetranslateDescription: contentLabels.confirmRetranslateDescription,
        confirmRetranslateTitle: contentLabels.confirmRetranslateTitle,
        confirmTranslate: contentLabels.confirmTranslate,
        confirmTranslateDescription: contentLabels.confirmTranslateDescription,
        confirmTranslateTitle: contentLabels.confirmTranslateTitle,
      }}
      onClose={() => setConfirmAction(null)}
      onConfirm={async (action) => {
        setConfirmAction(null);
        if (action === 'delete') await deleteTranslation();
        else await requestTranslation({ force: action === 'retranslate' });
      }}
    />
  ) : null;

  const retryBlock = useCallback((blockId: string) => {
    void requestTranslationRef.current({ sourceBlockIds: [blockId] });
  }, []);

  return {
    dialog,
    retryBlock,
    surfaceOutput,
    toolbar,
    translation: activeTranslation,
    translationInProgress,
    visible,
  };
}

function currentTranslationBlockIds(translation: ArticleTranslation | null) {
  return new Set((translation?.segments || []).map((segment) => segment.sourceBlockId));
}

function translationMatches(
  translation: ArticleTranslation,
  articleId: string,
  sourceId: string | undefined,
  targetLanguage: string | undefined,
) {
  return (
    translation.articleId === articleId &&
    (sourceId === undefined || translation.sourceId === sourceId) &&
    translation.targetLanguage === normalizeArticleTranslationTargetLanguage(targetLanguage)
  );
}

function translationContentLabels(
  contentKind: TranslationContentKind,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (contentKind === 'chapter') {
    return {
      confirmDeleteTranslation: t('readerTranslation.chapter.confirmDeleteTranslation'),
      confirmDeleteTranslationDescription: t(
        'readerTranslation.chapter.confirmDeleteTranslationDescription',
      ),
      confirmDeleteTranslationTitle: t('readerTranslation.chapter.confirmDeleteTranslationTitle'),
      confirmRetranslate: t('readerTranslation.chapter.confirmRetranslate'),
      confirmRetranslateDescription: t('readerTranslation.chapter.confirmRetranslateDescription'),
      confirmRetranslateTitle: t('readerTranslation.chapter.confirmRetranslateTitle'),
      confirmTranslate: t('readerTranslation.chapter.confirmTranslate'),
      confirmTranslateDescription: t('readerTranslation.chapter.confirmTranslateDescription'),
      confirmTranslateTitle: t('readerTranslation.chapter.confirmTranslateTitle'),
      deleteFailureKey: 'readerTranslation.chapter.deleteTranslationFailed',
      deleteTranslation: t('readerTranslation.chapter.deleteTranslation'),
      failureKey: 'readerTranslation.chapter.translationFailed',
      hideTranslation: t('readerTranslation.chapter.hideTranslation'),
      inProgressDescription: t('readerTranslation.chapter.translationInProgressToastDescription'),
      noTextKey: 'readerTranslation.chapter.translationNoText',
      retranslate: t('readerTranslation.chapter.retranslate'),
      showTranslation: t('readerTranslation.chapter.showTranslation'),
      translate: t('readerTranslation.chapter.translate'),
      translating: t('readerTranslation.chapter.translating'),
    };
  }
  return {
    confirmDeleteTranslation: t('readerTranslation.article.confirmDeleteTranslation'),
    confirmDeleteTranslationDescription: t(
      'readerTranslation.article.confirmDeleteTranslationDescription',
    ),
    confirmDeleteTranslationTitle: t('readerTranslation.article.confirmDeleteTranslationTitle'),
    confirmRetranslate: t('readerTranslation.article.confirmRetranslate'),
    confirmRetranslateDescription: t('readerTranslation.article.confirmRetranslateDescription'),
    confirmRetranslateTitle: t('readerTranslation.article.confirmRetranslateTitle'),
    confirmTranslate: t('readerTranslation.article.confirmTranslate'),
    confirmTranslateDescription: t('readerTranslation.article.confirmTranslateDescription'),
    confirmTranslateTitle: t('readerTranslation.article.confirmTranslateTitle'),
    deleteFailureKey: 'readerTranslation.article.deleteTranslationFailed',
    deleteTranslation: t('readerTranslation.article.deleteTranslation'),
    failureKey: 'readerTranslation.article.translationFailed',
    hideTranslation: t('readerTranslation.article.hideTranslation'),
    inProgressDescription: t('readerTranslation.article.translationInProgressToastDescription'),
    noTextKey: 'readerTranslation.article.translationNoText',
    retranslate: t('readerTranslation.article.retranslate'),
    showTranslation: t('readerTranslation.article.showTranslation'),
    translate: t('readerTranslation.article.translate'),
    translating: t('readerTranslation.article.translating'),
  };
}
