import type { CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { Comment, PublicAgent } from '@yomitomo/shared';
import { useTranslation } from 'react-i18next';
import { AvatarBadge } from '@yomitomo/reader-ui/reader-component-primitives';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';

export type AddThoughtAgentRunStatus = 'active' | 'done' | 'failed';

export type AddThoughtAgentRun = {
  agent: PublicAgent;
  errorMessage?: string;
  instruction?: string;
  progress?: Comment['assistantProgress'];
  readingIntent?: Comment['readingIntent'];
  status: AddThoughtAgentRunStatus;
};

type AgentRunAvatarStyle = CSSProperties & {
  '--agent-ink': string;
  '--agent-run-delay': string;
};

export function AddThoughtAssistantRunPanel({
  celebrating,
  onClose,
  onRetry,
  onRetryAll,
  runs,
}: {
  celebrating: boolean;
  onClose: () => void;
  onRetry: (agentId: string) => void;
  onRetryAll: () => void;
  runs: AddThoughtAgentRun[];
}) {
  const { t } = useTranslation();
  const activeCount = runs.filter((run) => run.status === 'active').length;
  const doneCount = runs.filter((run) => run.status === 'done').length;
  const failedRuns = runs.filter((run) => run.status === 'failed');
  const settled = activeCount === 0;

  return (
    <div className="annotation-discussion-add-run" aria-label={t('discussion.addThought.progress')}>
      {celebrating ? <AddThoughtCompletionBloom /> : null}
      {failedRuns.length > 0 && settled ? (
        <div className="annotation-discussion-add-run-summary">
          <strong>
            {t('discussion.addThought.runSummary', {
              done: doneCount,
              failed: failedRuns.length,
            })}
          </strong>
          <p>{t('discussion.addThought.runSummaryDescription')}</p>
        </div>
      ) : null}
      <div className="annotation-discussion-add-run-agents">
        {runs.map((run, index) => (
          <div
            className={`annotation-discussion-add-run-agent is-${run.status}`}
            key={run.agent.id}
          >
            <div
              className="annotation-discussion-add-run-avatar"
              style={
                {
                  '--agent-ink': run.agent.annotationColor,
                  '--agent-run-delay': `${index * 90}ms`,
                } as AgentRunAvatarStyle
              }
            >
              <AvatarBadge avatar={run.agent.avatar} fallback={run.agent.nickname.slice(0, 1)} />
              {run.status === 'done' ? (
                <span className="annotation-discussion-add-run-check">
                  <Check size={11} strokeWidth={3} />
                </span>
              ) : null}
            </div>
            <span className="annotation-discussion-add-run-inkline" aria-hidden="true" />
            <strong>{run.agent.nickname}</strong>
            <AssistantRuntimeProgressList progress={run.progress} />
            {run.status === 'failed' ? (
              <div className="annotation-discussion-add-run-failure">
                <p>{run.errorMessage || t('discussion.addThought.failed')}</p>
                {settled ? (
                  <button type="button" onClick={() => onRetry(run.agent.id)}>
                    {t('discussion.retry')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {failedRuns.length > 0 && settled ? (
        <footer className="annotation-discussion-add-run-actions">
          {failedRuns.length > 1 ? (
            <button type="button" onClick={onRetryAll}>
              {t('discussion.retryAll')}
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            {t('discussion.stopRetry')}
          </button>
        </footer>
      ) : null}
    </div>
  );
}

function AddThoughtCompletionBloom() {
  return (
    <div className="annotation-discussion-add-run-bloom" aria-hidden="true">
      <span className="annotation-discussion-add-run-bloom-ripple" />
      <span className="annotation-discussion-add-run-bloom-ripple is-wide" />
    </div>
  );
}
