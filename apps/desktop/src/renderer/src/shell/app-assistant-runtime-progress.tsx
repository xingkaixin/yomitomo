import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CircleIcon, Loading03Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import type {
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
} from '@yomitomo/shared';
import { desktopIpcErrorCodes, isDesktopIpcErrorLike } from '../../../ipc-errors';
import i18next from 'i18next';
import { useTranslation } from 'react-i18next';

export function applyAssistantRuntimeProgress(
  current: AssistantRuntimeProgressSummary | undefined,
  event: AssistantRuntimeProgressEvent,
): AssistantRuntimeProgressSummary {
  const summary = current || { steps: [] };
  if (event.type === 'fallback') return { ...summary, fallbackMessage: event.message };
  const steps = summary.steps.filter((step) => step.id !== event.step.id);
  return { ...summary, steps: [...steps, event.step] };
}

export function AssistantRuntimeProgressList({
  progress,
}: {
  progress?: AssistantRuntimeProgressSummary;
}) {
  const { t } = useTranslation();
  if (!progress || (progress.steps.length === 0 && !progress.fallbackMessage)) return null;

  return (
    <div className="assistant-runtime-progress" aria-label={t('assistantProgress.deepSteps')}>
      {progress.steps.length > 0 ? (
        <ol>
          {progress.steps.map((step) => (
            <li className={`is-${step.status}`} key={step.id}>
              {step.status === 'done' ? (
                <HugeiconsIcon icon={Tick01Icon} size={12} />
              ) : step.status === 'failed' ? (
                <HugeiconsIcon icon={Cancel01Icon} size={12} />
              ) : (
                <HugeiconsIcon icon={Loading03Icon} size={12} />
              )}
              <span>{assistantRuntimeStepLabel(step.id, step.label, t)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {progress.fallbackMessage ? (
        <p>
          <HugeiconsIcon icon={CircleIcon} size={10} />
          <span>{assistantRuntimeFallbackMessage(progress.fallbackMessage, t)}</span>
        </p>
      ) : null}
    </div>
  );
}

export function assistantRuntimeErrorMessage(error: unknown, fallbackKey: string) {
  const ipcMessage = assistantRuntimeIpcErrorMessage(error);
  if (ipcMessage) return ipcMessage;
  if (isDesktopIpcErrorLike(error)) return i18next.t(fallbackKey);
  const message = error instanceof Error ? error.message : '';
  return message || i18next.t(fallbackKey);
}

function assistantRuntimeIpcErrorMessage(error: unknown) {
  if (!isDesktopIpcErrorLike(error)) return '';
  const username = typeof error.detail?.username === 'string' ? error.detail.username : '';
  const name = username ? `@${username}` : '';
  if (error.code === desktopIpcErrorCodes.agentNotFound) {
    return i18next.t('assistantErrors.agentNotFound', { name });
  }
  if (error.code === desktopIpcErrorCodes.reviewAgentNotFound) {
    return i18next.t('assistantErrors.reviewAgentNotFound', { name });
  }
  if (error.code === desktopIpcErrorCodes.annotationAgentNotFound) {
    return i18next.t('assistantErrors.annotationAgentNotFound', { name });
  }
  if (error.code === desktopIpcErrorCodes.providerRouteRequired) {
    const task = typeof error.detail?.task === 'string' ? error.detail.task : '';
    if (task === 'readingAssistant')
      return i18next.t('settings.models.readingProviderRouteRequired');
    if (task === 'reviewAssistant') return i18next.t('settings.models.reviewProviderRouteRequired');
    if (task === 'bilingualTranslation') {
      return i18next.t('settings.models.translationProviderRouteRequired');
    }
  }
  if (error.code === desktopIpcErrorCodes.providerApiKeyRequired) {
    return i18next.t('settings.models.providerApiKeyRequired');
  }
  return '';
}

function assistantRuntimeStepLabel(
  stepId: string,
  fallback: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  const label = t(`assistantProgress.steps.${stepId}`, { defaultValue: '' });
  return label || fallback;
}

function assistantRuntimeFallbackMessage(
  message: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  if (message === 'ASSISTANT_RUNTIME_FALLBACK_FAST_RESPONSE') {
    return t('assistantProgress.fallback.fastResponse');
  }
  return message;
}
