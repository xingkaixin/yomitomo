import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import type { ArticleTranslation } from '@yomitomo/shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { appToast } from '../../shell/app-toast';

type TranslationToastId = string | number;

const translationToastExpandedDurationMs = 24 * 60 * 60 * 1000;

export function useSourceTranslationProgressToast({
  failureKey,
  inProgressDescription,
  onRevealFirstFailedTranslationSegment,
  t,
  translatingLabel,
}: {
  failureKey: string;
  inProgressDescription: string;
  onRevealFirstFailedTranslationSegment: (nextTranslation: ArticleTranslation) => void;
  t: TFunction;
  translatingLabel: string;
}) {
  const inputRef = useRef({
    failureKey,
    inProgressDescription,
    onRevealFirstFailedTranslationSegment,
    t,
    translatingLabel,
  });
  const toastIdRef = useRef<TranslationToastId | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  inputRef.current = {
    failureKey,
    inProgressDescription,
    onRevealFirstFailedTranslationSegment,
    t,
    translatingLabel,
  };

  const clearDismissTimer = useCallback(() => {
    if (dismissTimerRef.current === null) return;
    window.clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearDismissTimer();
    const toastId = toastIdRef.current;
    if (toastId === null) return;
    appToast.dismiss(toastId);
    toastIdRef.current = null;
  }, [clearDismissTimer]);

  const progressDescription = useCallback(
    (translation: ArticleTranslation | null): React.ReactNode => {
      const stats = translation ? articleTranslationStats(translation) : null;
      const completed = stats ? stats.ready + stats.failed : 0;
      const progress = stats && stats.total > 0 ? completed / stats.total : 0;
      const width = `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;

      return (
        <div
          className={stats ? 'translation-toast-progress' : 'translation-toast-progress is-pending'}
        >
          <span>
            {translation
              ? translationProgressToastText(translation, inputRef.current.t)
              : inputRef.current.inProgressDescription}
          </span>
          <i aria-hidden="true" className="translation-toast-progress-track">
            <b className="translation-toast-progress-fill" style={{ width }} />
          </i>
        </div>
      );
    },
    [],
  );

  const scheduleDismiss = useCallback(
    (delayMs: number) => {
      clearDismissTimer();
      const toastId = toastIdRef.current;
      if (toastId === null) return;
      dismissTimerRef.current = window.setTimeout(() => {
        dismissTimerRef.current = null;
        if (toastIdRef.current !== toastId) return;
        appToast.dismiss(toastId);
        toastIdRef.current = null;
      }, delayMs);
    },
    [clearDismissTimer],
  );

  const start = useCallback(() => {
    dismiss();
    toastIdRef.current = appToast.info(inputRef.current.translatingLabel, {
      description: progressDescription(null),
      duration: Infinity,
      timing: { displayDuration: translationToastExpandedDurationMs },
    });
  }, [dismiss, progressDescription]);

  const update = useCallback(
    (translation: ArticleTranslation) => {
      const toastId = toastIdRef.current;
      if (toastId === null || translation.status !== 'translating') return;
      appToast.update(toastId, {
        description: progressDescription(translation),
        title: inputRef.current.translatingLabel,
        type: 'info',
      });
    },
    [progressDescription],
  );

  const finish = useCallback(
    (translation: ArticleTranslation) => {
      const toastId = toastIdRef.current;
      if (toastId === null) return;
      const stats = articleTranslationStats(translation);
      appToast.update(toastId, {
        action:
          stats.failed > 0
            ? {
                label: inputRef.current.t('readerTranslation.common.translationFailedToastAction'),
                onClick: () => inputRef.current.onRevealFirstFailedTranslationSegment(translation),
                successLabel: inputRef.current.t(
                  'readerTranslation.common.translationFailedToastActionDone',
                ),
              }
            : undefined,
        description: translationCompletionToastDescription(translation, inputRef.current.t),
        title: translationCompletionToastTitle(translation, inputRef.current.t),
        type: stats.failed > 0 ? 'warning' : 'success',
      });
      scheduleDismiss(stats.failed > 0 ? 12_000 : 6_000);
    },
    [scheduleDismiss],
  );

  const fail = useCallback(
    (error: unknown) => {
      const message = assistantRuntimeErrorMessage(error, inputRef.current.failureKey);
      const toastId = toastIdRef.current;
      if (toastId === null) {
        appToast.error(message);
        return;
      }
      appToast.update(toastId, {
        title: message,
        type: 'error',
      });
      scheduleDismiss(8_000);
    },
    [scheduleDismiss],
  );

  return useMemo(
    () => ({
      dismiss,
      fail,
      finish,
      start,
      update,
    }),
    [dismiss, fail, finish, start, update],
  );
}

function articleTranslationStats(translation: ArticleTranslation) {
  let ready = 0;
  let failed = 0;
  for (const segment of translation.segments) {
    if (segment.status === 'ready') ready += 1;
    else if (segment.status === 'failed') failed += 1;
  }
  return {
    failed,
    ready,
    total: translation.segments.length,
  };
}

function translationCompletionToastTitle(translation: ArticleTranslation, t: TFunction) {
  const stats = articleTranslationStats(translation);
  if (stats.failed > 0) {
    return t('readerTranslation.common.translationCompleteWithFailuresToast', {
      failed: stats.failed,
    });
  }
  return t('readerTranslation.common.translationCompleteToast');
}

function translationCompletionToastDescription(translation: ArticleTranslation, t: TFunction) {
  const stats = articleTranslationStats(translation);
  if (stats.failed > 0) {
    return t('readerTranslation.common.translationCompleteWithFailuresDescription', {
      failed: stats.failed,
      ready: stats.ready,
      total: stats.total,
    });
  }
  return t('readerTranslation.common.translationCompleteToastDescription', {
    ready: stats.ready,
    total: stats.total,
  });
}

function translationProgressToastText(translation: ArticleTranslation, t: TFunction) {
  const stats = articleTranslationStats(translation);
  if (stats.failed > 0) {
    return t('readerTranslation.common.translationProgressWithFailuresToastDescription', {
      failed: stats.failed,
      ready: stats.ready,
      total: stats.total,
    });
  }
  return t('readerTranslation.common.translationProgressToastDescription', {
    ready: stats.ready,
    total: stats.total,
  });
}
