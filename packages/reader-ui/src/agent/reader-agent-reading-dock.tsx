import type React from 'react';
import { AvatarBadge } from '../shared/reader-component-primitives';
import { cursorColorFromId } from '../reader-style-utils';
import type { AgentDockItem } from '../reader-types';
import type { ReaderUiLabels } from '../shell/reader-app-view-types';
import { defaultReaderUiLabels } from '../shell/reader-app-view-types';

type ReaderCompletionParticleStyle = React.CSSProperties & {
  '--reader-confetti-color': string;
  '--reader-confetti-delay': string;
  '--reader-confetti-rotate': string;
  '--reader-confetti-x': string;
  '--reader-confetti-y': string;
};

type ReaderDockItemStyle = React.CSSProperties & {
  '--agent-color': string;
  '--reader-dock-delay': string;
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

export function ReadingCompletionBurst() {
  return (
    <div className="reader-completion-burst" aria-hidden="true">
      <div className="reader-completion-burst-center">
        <span className="reader-completion-burst-ring" />
        <span className="reader-completion-burst-ring is-wide" />
        {completionBurstParticles.map((particle, index) => (
          <CompletionParticle
            particle={particle}
            index={index}
            key={`${particle.x}:${particle.y}:${index}`}
          />
        ))}
      </div>
    </div>
  );
}

export function AgentReadingDock({
  completionBurstKey,
  completing,
  items,
  labels = defaultReaderUiLabels,
}: {
  completionBurstKey: number;
  completing: boolean;
  items: AgentDockItem[];
  labels?: ReaderUiLabels;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className={['reader-agent-dock', completing ? 'is-completing' : ''].filter(Boolean).join(' ')}
      aria-label={labels.assistantReadingStatus}
    >
      <div className="reader-agent-dock-list">
        {items.map((item, index) => {
          const color = item.agent.annotationColor || cursorColorFromId(item.agent.id);
          const style: ReaderDockItemStyle = {
            '--agent-color': color,
            '--reader-dock-delay': `${index * 80}ms`,
          };
          return (
            <div
              className={`reader-agent-dock-item is-${item.state}`}
              key={item.agent.id}
              style={style}
              title={`${item.agent.nickname} ${
                item.state === 'active' ? labels.assistantReadingActive : labels.assistantCompleted
              }`}
            >
              <AvatarBadge avatar={item.agent.avatar} fallback={item.agent.nickname.slice(0, 1)} />
            </div>
          );
        })}
      </div>
      {completionBurstKey > 0 && completing ? (
        <ReadingCompletionBurst key={completionBurstKey} />
      ) : null}
    </div>
  );
}

function CompletionParticle({
  index,
  particle,
}: {
  index: number;
  particle: (typeof completionBurstParticles)[number];
}) {
  const style: ReaderCompletionParticleStyle = {
    '--reader-confetti-color': particle.color,
    '--reader-confetti-delay': `${particle.delay}ms`,
    '--reader-confetti-rotate': `${particle.rotate}deg`,
    '--reader-confetti-x': `${particle.x}px`,
    '--reader-confetti-y': `${particle.y}px`,
  };
  return (
    <span
      className={`reader-completion-particle is-${particle.shape}`}
      key={`${particle.x}:${particle.y}:${index}`}
      style={style}
    />
  );
}
