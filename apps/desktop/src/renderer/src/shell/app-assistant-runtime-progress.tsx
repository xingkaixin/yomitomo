import { Check, Circle, LoaderCircle, X } from 'lucide-react';
import type {
  AssistantRuntimeProgressEvent,
  AssistantRuntimeProgressSummary,
} from '@yomitomo/shared';

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
  if (!progress || (progress.steps.length === 0 && !progress.fallbackMessage)) return null;

  return (
    <div className="assistant-runtime-progress" aria-label="深入探索步骤">
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
              <span>{step.label}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {progress.fallbackMessage ? (
        <p>
          <Circle size={10} />
          <span>{progress.fallbackMessage}</span>
        </p>
      ) : null}
    </div>
  );
}
