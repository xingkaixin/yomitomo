import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, CircleIcon, Loading03Icon, Tick01Icon } from '@hugeicons/core-free-icons';
import type {
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
} from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { classifyAssistantError } from './assistant-error-classification';

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
    <div className="assistant-runtime-progress" aria-label={t('assistantProgress.processSteps')}>
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
  return classifyAssistantError(error, fallbackKey).message;
}

function assistantRuntimeStepLabel(
  stepId: string,
  fallback: string,
  t: ReturnType<typeof useTranslation>['t'],
) {
  // Tool steps carry the call id as id and the tool name as label.
  return (
    t(`assistantProgress.steps.${stepId}`, { defaultValue: '' }) ||
    t(`assistantProgress.steps.${fallback}`, { defaultValue: '' }) ||
    fallback
  );
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
