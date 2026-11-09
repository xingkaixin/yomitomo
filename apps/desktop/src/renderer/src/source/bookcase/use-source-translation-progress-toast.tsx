import { useCallback, useMemo, useRef } from 'react';
import type { TFunction } from 'i18next';
import type { ArticleTranslation } from '@yomitomo/shared';
import { assistantRuntimeErrorMessage } from '../../shell/app-assistant-runtime-progress';
import { appToast } from '../../shell/app-toast';

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
  const toastIdRef = useRef<number | null>(null);
  inputRef.current = {
    failureKey,
    inProgressDescription,
    onRevealFirstFailedTranslationSegment,
    t,
    translatingLabel,
  };

  const dismiss = useCallback(() => {
    const toastId = toastIdRef.current;
    if (toastId === null) return;
    appToast.dismiss(toastId);
    toastIdRef.current = null;
  }, []);

  const start = useCallback(() => {
    dismiss();
    toastIdRef.current = appToast.progress(inputRef.current.translatingLabel, {
      description: inputRef.current.inProgressDescription,
      progress: { value: 0 },
    });
  }, [dismiss]);

  const update = useCallback((translation: ArticleTranslation) => {
    const toastId = toastIdRef.current;
    if (toastId === null || translation.status !== 'translating') return;
    const stats = articleTranslationStats(translation);
    const completed = stats.ready + stats.failed;
    appToast.updateProgress(toastId, {
      description: translationProgressToastText(translation, inputRef.current.t),
      progress: {
        label: `${completed}/${stats.total}`,
        value: stats.total > 0 ? completed / stats.total : 0,
      },
      title: inputRef.current.translatingLabel,
    });
  }, []);

  const finish = useCallback((translation: ArticleTranslation) => {
    const toastId = toastIdRef.current;
    if (toastId === null) return;
    const stats = articleTranslationStats(translation);
    appToast.complete(
      toastId,
      stats.failed > 0 ? 'warning' : 'success',
      translationCompletionToastTitle(translation, inputRef.current.t),
      {
        action:
          stats.failed > 0
            ? {
                doneLabel: inputRef.current.t(
                  'readerTranslation.common.translationFailedToastActionDone',
                ),
                label: inputRef.current.t('readerTranslation.common.translationFailedToastAction'),
                onClick: () => inputRef.current.onRevealFirstFailedTranslationSegment(translation),
              }
            : undefined,
        description: translationCompletionToastDescription(translation, inputRef.current.t),
      },
    );
  }, []);

  const fail = useCallback((error: unknown) => {
    const message = assistantRuntimeErrorMessage(error, inputRef.current.failureKey);
    const toastId = toastIdRef.current;
    if (toastId === null) {
      appToast.error(message);
      return;
    }
    appToast.complete(toastId, 'error', message);
  }, []);

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
