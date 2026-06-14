import { Check, Circle, LoaderCircle, X } from 'lucide-react';
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
                <Check size={12} />
              ) : step.status === 'failed' ? (
                <X size={12} />
              ) : (
                <LoaderCircle size={12} />
              )}
              <span>{assistantRuntimeStepLabel(step.id, step.label, t)}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {progress.fallbackMessage ? (
        <p>
          <Circle size={10} />
          <span>{assistantRuntimeFallbackMessage(progress.fallbackMessage, t)}</span>
        </p>
      ) : null}
    </div>
  );
}

export function assistantRuntimeErrorMessage(error: unknown, fallbackKey: string) {
  const ipcMessage = assistantRuntimeIpcErrorMessage(error);
  if (ipcMessage) return ipcMessage;
  const message = error instanceof Error ? error.message : '';
  if (message === 'AGENT_REPLY_FAILED') return i18next.t(fallbackKey);
  if (message === 'AGENT_DISTILLATION_REVIEW_FAILED') {
    return i18next.t('sedimentation.reviewFailed');
  }
  if (message === 'AGENT_ANNOTATION_FAILED') {
    return i18next.t('discussion.addThought.assistantFailed');
  }
  if (message === 'PROVIDER_API_KEY_REQUIRED') {
    return i18next.t('settings.models.providerApiKeyRequired');
  }
  if (message === 'PROVIDER_ROUTE_REQUIRED:readingAssistant') {
    return i18next.t('settings.models.readingProviderRouteRequired');
  }
  if (message === 'PROVIDER_ROUTE_REQUIRED:reviewAssistant') {
    return i18next.t('settings.models.reviewProviderRouteRequired');
  }
  if (message === 'PROVIDER_ROUTE_REQUIRED:bilingualTranslation') {
    return i18next.t('settings.models.translationProviderRouteRequired');
  }
  const agentNotFound = agentNotFoundMessage(message);
  if (agentNotFound) return agentNotFound;
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
  return '';
}

function agentNotFoundMessage(message: string) {
  const [code, username = ''] = message.split(':');
  const name = username ? `@${username}` : '';
  if (code === 'AGENT_NOT_FOUND') return i18next.t('assistantErrors.agentNotFound', { name });
  if (code === 'REVIEW_AGENT_NOT_FOUND') {
    return i18next.t('assistantErrors.reviewAgentNotFound', { name });
  }
  if (code === 'ANNOTATION_AGENT_NOT_FOUND') {
    return i18next.t('assistantErrors.annotationAgentNotFound', { name });
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
