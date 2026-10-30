import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useStableCallback } from '@yomitomo/reader-ui/use-stable-callback';
import { useTranslation } from 'react-i18next';
import type { ArticleTranslation, ArticleTranslationSourceBlockInput } from '@yomitomo/shared';
import { normalizeArticleTranslationTargetLanguage } from '@yomitomo/shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { getDesktopApi, getOptionalDesktopApi } from '../../shell/app-desktop-api';
import { appToast } from '../../shell/app-toast';
import { useDesktopEvent } from '../../shell/use-desktop-event';
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
  prepareRemoval: (blockIds: ReadonlySet<string>) => () => Promise<void>;
};

type TranslationContentKind = 'article' | 'chapter';

type TranslationRequestOptions = {
  force?: boolean;
  sourceBlockIds?: string[];
};

type UseSourceBilingualTranslationInput<ApplyResult> = {
  articleId: string;
  contentKind: TranslationContentKind;
  onTranslationReceived?: (
    translation: ArticleTranslation,
    previous: ArticleTranslation | null,
  ) => void;
  surface: TranslationSurfaceAdapter<ApplyResult> | null;
  targetLanguage?: string;
  translationAnnotations?: TranslationAnnotationsAdapter;
};

type TranslationScope = {
  articleId: string;
  sourceId: string | undefined;
  targetLanguage: string | undefined;
};

type TranslationSessionState = {
  busy: boolean;
  confirmAction: TranslationConfirmAction | null;
  menuOpen: boolean;
  translation: ArticleTranslation | null;
  visible: boolean;
};

type TranslationSession = {
  getState: () => TranslationSessionState;
  scope: TranslationScope | null;
  subscribe: (listener: () => void) => () => void;
  update: (change: Partial<TranslationSessionState>) => void;
};

const idleTranslationSession: TranslationSessionState = {
  busy: false,
  confirmAction: null,
  menuOpen: false,
  translation: null,
  visible: false,
};

export function useSourceBilingualTranslation<ApplyResult>({
  articleId,
  contentKind,
  onTranslationReceived,
  surface,
  targetLanguage,
  translationAnnotations,
}: UseSourceBilingualTranslationInput<ApplyResult>) {
  const { t } = useTranslation();
  const sourceId = surface?.sourceId;
  const hasSurface = Boolean(surface);
  const contentLabels = translationContentLabels(contentKind, t);

  const revealFirstFailedTranslationSegment = useStableCallback(
    (nextTranslation: ArticleTranslation) => {
      const blockId = nextTranslation.segments.find(
        (segment) => segment.status === 'failed',
      )?.sourceBlockId;
      if (!blockId) return;
      translationSession.update({ visible: true });
      window.requestAnimationFrame(() => readSurface()?.scrollToBlock(blockId));
    },
  );

  const progressToast = useSourceTranslationProgressToast({
    failureKey: contentLabels.failureKey,
    inProgressDescription: contentLabels.inProgressDescription,
    onRevealFirstFailedTranslationSegment: revealFirstFailedTranslationSegment,
    t,
    translatingLabel: contentLabels.translating,
  });

  const receiveTranslation = useStableCallback(
    (session: TranslationSession, nextTranslation: ArticleTranslation) => {
      const { scope } = session;
      if (
        !scope ||
        !translationMatches(nextTranslation, scope.articleId, scope.sourceId, scope.targetLanguage)
      ) {
        return;
      }
      const previous = session.getState().translation;
      progressToast.update(nextTranslation);
      session.update({ translation: nextTranslation, visible: true });
      onTranslationReceived?.(nextTranslation, previous);
    },
  );

  // Each article, chapter, and target language gets a fresh session, like a remount would.
  const translationSession = useMemo(
    () =>
      createTranslationSession(hasSurface ? { articleId, sourceId, targetLanguage } : null, {
        ended: () => progressToast.dismiss(),
        loaded: (session, current) => {
          if (current) receiveTranslation(session, current);
          else session.update({ translation: null, visible: false });
        },
      }),
    [articleId, hasSurface, progressToast, sourceId, targetLanguage],
  );
  const { busy, confirmAction, menuOpen, translation, visible } = useSyncExternalStore(
    translationSession.subscribe,
    translationSession.getState,
  );
  const readSurface = useStableCallback(() => surface);
  const isCurrentSession = useStableCallback(
    (session: TranslationSession) => session === translationSession,
  );

  useDesktopEvent(getOptionalDesktopApi()?.article?.translation?.onUpdated, (update) =>
    receiveTranslation(translationSession, update),
  );

  const requestTranslation = useStableCallback(async (options: TranslationRequestOptions = {}) => {
    const session = translationSession;
    const activeSurface = surface;
    const { scope } = session;
    if (!activeSurface || !scope || session.getState().busy) return;
    const current = session.getState();
    if (
      !options.force &&
      !options.sourceBlockIds?.length &&
      current.translation &&
      !current.visible
    ) {
      session.update({ visible: true });
      return;
    }

    const blocks = activeSurface.extractBlocks();
    if (blocks.length === 0) {
      appToast.error(t(contentLabels.noTextKey));
      return;
    }

    const requestedSourceId = activeSurface.sourceId;
    session.update({ busy: true, visible: true });
    progressToast.start();
    let stopWatchingStart: (() => void) | undefined;
    try {
      const replacedBlockIds = options.force
        ? currentTranslationBlockIds(current.translation)
        : new Set(options.sourceBlockIds || []);
      const removeReplacedAnnotations = runOnce(
        translationAnnotations?.prepareRemoval(replacedBlockIds),
      );
      // Main emits the first update only after it resets the replaced segments, so failures
      // before that point, such as a missing provider or API key, keep the annotations.
      stopWatchingStart = getOptionalDesktopApi()?.article?.translation?.onUpdated((update) => {
        if (translationMatches(update, scope.articleId, requestedSourceId, scope.targetLanguage)) {
          removeReplacedAnnotations().catch(() => {});
        }
      });
      const nextTranslation = await getDesktopApi().article.translation.translate({
        articleId: scope.articleId,
        force: options.force,
        sourceBlockIds: options.sourceBlockIds,
        ...(requestedSourceId
          ? {
              sourceBlocks: blocks,
              sourceId: requestedSourceId,
            }
          : {}),
        targetLanguage: scope.targetLanguage,
      });
      await removeReplacedAnnotations();
      if (!isCurrentSession(session)) return;
      receiveTranslation(session, nextTranslation);
      progressToast.finish(nextTranslation);
    } catch (error) {
      if (isCurrentSession(session)) progressToast.fail(error);
    } finally {
      stopWatchingStart?.();
      session.update({ busy: false });
    }
  });

  async function deleteTranslation() {
    const session = translationSession;
    const { scope } = session;
    if (!surface || !scope || session.getState().busy) return;
    const deletedSourceId = surface.sourceId;
    session.update({ busy: true });
    try {
      await translationAnnotations?.prepareRemoval(
        currentTranslationBlockIds(session.getState().translation),
      )();
      await getDesktopApi().article.translation.deleteCurrent({
        articleId: scope.articleId,
        ...(deletedSourceId ? { sourceId: deletedSourceId } : {}),
        targetLanguage: scope.targetLanguage,
      });
      if (!isCurrentSession(session)) return;
      progressToast.dismiss();
      session.update({ menuOpen: false, translation: null, visible: false });
    } catch (error) {
      if (isCurrentSession(session)) {
        appToast.error(assistantRuntimeErrorMessage(error, contentLabels.deleteFailureKey));
      }
    } finally {
      session.update({ busy: false });
    }
  }

  const translationInProgress = busy || translation?.status === 'translating';
  const surfaceOutput = useMemo(
    () => surface?.applyTranslation(translation, visible) ?? null,
    [surface, translation, visible],
  );
  const translationAnnotationCount = useMemo(
    () =>
      translation && translationAnnotations
        ? translationAnnotations.count(currentTranslationBlockIds(translation))
        : 0,
    [translation, translationAnnotations],
  );

  const toolbar = hasSurface ? (
    <ReaderTranslationToolbarButton
      busy={translationInProgress}
      hasTranslation={Boolean(translation)}
      labels={{
        deleteTranslation: contentLabels.deleteTranslation,
        hideTranslation: contentLabels.hideTranslation,
        retranslate: contentLabels.retranslate,
        showTranslation: contentLabels.showTranslation,
        translate: contentLabels.translate,
      }}
      menuOpen={menuOpen}
      visible={visible}
      onConfirm={(action) => translationSession.update({ confirmAction: action })}
      onMenuOpenChange={(open) => translationSession.update({ menuOpen: open })}
      onSetVisible={(nextVisible) => translationSession.update({ visible: nextVisible })}
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
      onClose={() => translationSession.update({ confirmAction: null })}
      onConfirm={async (action) => {
        translationSession.update({ confirmAction: null });
        if (action === 'delete') await deleteTranslation();
        else await requestTranslation({ force: action === 'retranslate' });
      }}
    />
  ) : null;

  const retryBlock = useCallback((blockId: string) => {
    void requestTranslation({ sourceBlockIds: [blockId] });
  }, []);

  return {
    dialog,
    retryBlock,
    surfaceOutput,
    toolbar,
    translation,
    translationInProgress,
    visible,
  };
}

function createTranslationSession(
  scope: TranslationScope | null,
  lifecycle: {
    ended: () => void;
    loaded: (session: TranslationSession, current: ArticleTranslation | null) => void;
  },
) {
  let state = idleTranslationSession;
  const listeners = new Set<() => void>();
  const session: TranslationSession = {
    scope,
    getState: () => state,
    update: (change: Partial<TranslationSessionState>) => {
      const next = { ...state, ...change };
      const keys = Object.keys(change) as (keyof TranslationSessionState)[];
      if (keys.every((key) => next[key] === state[key])) return;
      state = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      let active = true;
      if (scope) {
        void getDesktopApi()
          .article.translation.getCurrent({
            articleId: scope.articleId,
            ...(scope.sourceId ? { sourceId: scope.sourceId } : {}),
            targetLanguage: scope.targetLanguage,
          })
          .then((current) => {
            if (active) lifecycle.loaded(session, current);
          })
          .catch(() => {
            if (active) session.update({ translation: null });
          });
      }
      return () => {
        active = false;
        listeners.delete(listener);
        lifecycle.ended();
      };
    },
  };
  return session;
}

function runOnce(task: (() => Promise<void>) | undefined) {
  let running: Promise<void> | undefined;
  return () => (running ??= task ? task() : Promise.resolve());
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
