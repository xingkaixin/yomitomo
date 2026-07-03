import type React from 'react';
import { useCallback, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import type { ArticleTranslation } from '@yomitomo/shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { appToast } from '../../shell/app-toast';
import {
  articleTranslationStats,
  translationCompletionToastDescription,
  translationCompletionToastTitle,
  translationProgressToastText,
} from './app-source-bookcase-web-utils';

type TranslationToastId = string | number;

const translationToastExpandedDurationMs = 24 * 60 * 60 * 1000;

export function useWebTranslationProgressToast({
  onRevealFirstFailedTranslationSegment,
  t,
}: {
  onRevealFirstFailedTranslationSegment: (nextTranslation: ArticleTranslation) => void;
  t: TFunction;
}) {
  const onRevealFirstFailedTranslationSegmentRef = useRef(onRevealFirstFailedTranslationSegment);
  const tRef = useRef(t);
  const translationToastIdRef = useRef<TranslationToastId | null>(null);
  const translationToastDismissTimerRef = useRef<number | null>(null);
  onRevealFirstFailedTranslationSegmentRef.current = onRevealFirstFailedTranslationSegment;
  tRef.current = t;

  const clear = useCallback(() => {
    if (!translationToastDismissTimerRef.current) return;
    window.clearTimeout(translationToastDismissTimerRef.current);
    translationToastDismissTimerRef.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clear();
    const toastId = translationToastIdRef.current;
    if (!toastId) return;
    appToast.dismiss(toastId);
    translationToastIdRef.current = null;
  }, [clear]);

  const translationProgressToastDescription = useCallback(
    (nextTranslation: ArticleTranslation | null): React.ReactNode => {
      const stats = nextTranslation ? articleTranslationStats(nextTranslation) : null;
      const completed = stats ? stats.ready + stats.failed : 0;
      const progress = stats && stats.total > 0 ? completed / stats.total : 0;
      const width = `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;

      return (
        <div
          className={stats ? 'translation-toast-progress' : 'translation-toast-progress is-pending'}
        >
          <span>
            {nextTranslation
              ? translationProgressToastText(nextTranslation, tRef.current)
              : tRef.current('source.translationInProgressToastDescription')}
          </span>
          <i aria-hidden="true" className="translation-toast-progress-track">
            <b className="translation-toast-progress-fill" style={{ width }} />
          </i>
        </div>
      );
    },
    [],
  );

  const schedule = useCallback(
    (delayMs: number) => {
      clear();
      const toastId = translationToastIdRef.current;
      if (!toastId) return;
      translationToastDismissTimerRef.current = window.setTimeout(() => {
        translationToastDismissTimerRef.current = null;
        if (translationToastIdRef.current !== toastId) return;
        appToast.dismiss(toastId);
        translationToastIdRef.current = null;
      }, delayMs);
    },
    [clear],
  );

  const start = useCallback(() => {
    dismiss();
    translationToastIdRef.current = appToast.info(tRef.current('source.translatingArticle'), {
      description: translationProgressToastDescription(null),
      duration: Infinity,
      timing: { displayDuration: translationToastExpandedDurationMs },
    });
  }, [dismiss, translationProgressToastDescription]);

  const update = useCallback(
    (nextTranslation: ArticleTranslation) => {
      const toastId = translationToastIdRef.current;
      if (!toastId || nextTranslation.status !== 'translating') return;
      appToast.update(toastId, {
        description: translationProgressToastDescription(nextTranslation),
        title: tRef.current('source.translatingArticle'),
        type: 'info',
      });
    },
    [translationProgressToastDescription],
  );

  const finish = useCallback(
    (nextTranslation: ArticleTranslation) => {
      const toastId = translationToastIdRef.current;
      if (!toastId) return;
      const stats = articleTranslationStats(nextTranslation);
      appToast.update(toastId, {
        action:
          stats.failed > 0
            ? {
                label: tRef.current('source.translationFailedToastAction'),
                onClick: () => onRevealFirstFailedTranslationSegmentRef.current(nextTranslation),
                successLabel: tRef.current('source.translationFailedToastActionDone'),
              }
            : undefined,
        description: translationCompletionToastDescription(nextTranslation, tRef.current),
        title: translationCompletionToastTitle(nextTranslation, tRef.current),
        type: stats.failed > 0 ? 'warning' : 'success',
      });
      schedule(stats.failed > 0 ? 12_000 : 6_000);
    },
    [schedule],
  );

  const fail = useCallback(
    (error: unknown) => {
      const toastId = translationToastIdRef.current;
      if (!toastId) {
        appToast.error(assistantRuntimeErrorMessage(error, 'source.translationFailed'));
        return;
      }
      appToast.update(toastId, {
        title: assistantRuntimeErrorMessage(error, 'source.translationFailed'),
        type: 'error',
      });
      schedule(8_000);
    },
    [schedule],
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
