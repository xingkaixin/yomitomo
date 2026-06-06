import type { CSSProperties } from 'react';
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

type CompletionParticleStyle = CSSProperties & {
  '--reader-confetti-color': string;
  '--reader-confetti-delay': string;
  '--reader-confetti-rotate': string;
  '--reader-confetti-x': string;
  '--reader-confetti-y': string;
};

const completionBurstParticles = [
  { x: -128, y: -42, rotate: -28, delay: 0, color: '#5EC0E8', shape: 'strip' },
  { x: -94, y: -82, rotate: 36, delay: 18, color: '#54CDA0', shape: 'dot' },
  { x: -58, y: -112, rotate: -74, delay: 34, color: '#F4C95D', shape: 'spark' },
  { x: -18, y: -96, rotate: 12, delay: 8, color: '#DBEEEF', shape: 'strip' },
  { x: 28, y: -116, rotate: 74, delay: 28, color: '#D683B2', shape: 'dot' },
  { x: 74, y: -88, rotate: -32, delay: 12, color: '#5EC0E8', shape: 'spark' },
  { x: 118, y: -52, rotate: 18, delay: 42, color: '#F4C95D', shape: 'strip' },
  { x: 142, y: -8, rotate: -62, delay: 58, color: '#54CDA0', shape: 'dot' },
  { x: 104, y: 34, rotate: 44, delay: 24, color: '#D683B2', shape: 'strip' },
  { x: 72, y: 74, rotate: -18, delay: 48, color: '#DBEEEF', shape: 'spark' },
  { x: 24, y: 92, rotate: 84, delay: 68, color: '#54CDA0', shape: 'dot' },
  { x: -24, y: 82, rotate: -42, delay: 38, color: '#5EC0E8', shape: 'strip' },
  { x: -78, y: 58, rotate: 26, delay: 62, color: '#F4C95D', shape: 'spark' },
  { x: -116, y: 12, rotate: -86, delay: 44, color: '#D683B2', shape: 'dot' },
  { x: -148, y: -6, rotate: 54, delay: 72, color: '#DBEEEF', shape: 'strip' },
  { x: 0, y: -142, rotate: 0, delay: 52, color: '#F4C95D', shape: 'spark' },
  { x: 154, y: -72, rotate: 92, delay: 82, color: '#5EC0E8', shape: 'strip' },
  { x: -154, y: -76, rotate: -96, delay: 86, color: '#54CDA0', shape: 'strip' },
] as const;

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
      {celebrating ? <ReadingCompletionBurst /> : null}
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
              style={{ '--agent-run-delay': `${index * 90}ms` } as CSSProperties}
            >
              <AvatarBadge avatar={run.agent.avatar} fallback={run.agent.nickname.slice(0, 1)} />
            </div>
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

function ReadingCompletionBurst() {
  return (
    <div className="reader-completion-burst" aria-hidden="true">
      <div className="reader-completion-burst-center">
        <span className="reader-completion-burst-ring" />
        <span className="reader-completion-burst-ring is-wide" />
        {completionBurstParticles.map((particle, index) => {
          const style: CompletionParticleStyle = {
            '--reader-confetti-color': particle.color,
            '--reader-confetti-delay': `${particle.delay}ms`,
            '--reader-confetti-rotate': `${particle.rotate}deg`,
            '--reader-confetti-x': `${particle.x}px`,
            '--reader-confetti-y': `${particle.y}px`,
          };
          return (
            <span
              className={[
                'reader-completion-particle',
                particle.shape === 'dot' ? 'is-dot' : '',
                particle.shape === 'spark' ? 'is-spark' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={`${particle.x}:${particle.y}:${index}`}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}
