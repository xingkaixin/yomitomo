import { useEffect, useRef, useState } from 'react';
import { Layers2, MessageCircle } from 'lucide-react';
import { AvatarBadge } from '@yomitomo/reader-ui/reader-component-primitives';
import { getAgent, type Annotation } from '../data/article';
import DiscussionModal from './DiscussionModal';

type AnnotationCardProps = {
  annotation: Annotation;
  onActivate: (id: string | null) => void;
};

/** Simplified avatar stack using reader-ui CSS classes. */
function AgentAvatarStack({ agentIds }: { agentIds: string[] }) {
  return (
    <span className="reader-agent-avatar-stack">
      {agentIds.map((id) => {
        const agent = getAgent(id);
        const isImage = agent.avatar.startsWith('/') || agent.avatar.startsWith('http');
        return (
          <span
            key={id}
            className="reader-agent-avatar-stack-item"
            style={{ '--reader-avatar-color': agent.annotationColor } as React.CSSProperties}
            title={agent.nickname}
          >
            <AvatarBadge
              avatar={isImage ? agent.avatar : undefined}
              fallback={isImage ? 'AI' : agent.avatar}
            />
          </span>
        );
      })}
    </span>
  );
}

// ── Distillation Card (mirrors desktop AnnotationCard has-distillation) ──

function DistillationCard({ annotation }: { annotation: Annotation }) {
  const agent = getAgent(annotation.authorId);
  return (
    <article
      className="reader-note has-distillation"
      style={{
        '--reader-note-accent': agent.annotationColor,
      } as React.CSSProperties}
    >
      <div className="reader-note-body">
        <svg
          className="reader-note-distillation-ticket"
          viewBox="0 0 560 340"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <filter
              id={`reader-note-ticket-shadow-${annotation.id}`}
              x="-8%"
              y="-10%"
              width="116%"
              height="124%"
              colorInterpolationFilters="sRGB"
            >
              <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.12" />
              <feDropShadow dx="0" dy="1" stdDeviation="1" floodOpacity="0.1" />
            </filter>
          </defs>
          <path
            filter={`url(#reader-note-ticket-shadow-${annotation.id})`}
            d="M16,0 H544 A16,16 0 0 1 560,16 V60 C560,60 544,60 544,76 C544,92 560,92 560,92 V324 A16,16 0 0 1 544,340 H16 A16,16 0 0 1 0,324 V280 C0,280 16,280 16,264 C16,248 0,248 0,248 V16 A16,16 0 0 1 16,0 Z"
            fill="var(--reader-note-ticket-fill)"
            stroke="var(--reader-note-ticket-stroke)"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <header className="reader-note-card-header">
          <button className="reader-note-quote" type="button">
            <span className="reader-note-quote-text">{annotation.content}</span>
          </button>
        </header>

        <footer className="reader-note-toolbar reader-note-distillation-footer">
          <span className="reader-note-distillation-badge" aria-hidden="true">
            <Layers2 size={16} strokeWidth={1.9} />
          </span>
          <span className="reader-note-distillation-time">
            <time dateTime={annotation.createdAt}>{annotation.createdAt}</time>
          </span>
        </footer>
      </div>
    </article>
  );
}

// ── Discussion Card (quote + avatar stack + action) ──

function DiscussionCard({
  annotation,
  onOpenDiscussion,
}: {
  annotation: Annotation;
  onOpenDiscussion: () => void;
}) {
  const agent = getAgent(annotation.authorId);

  return (
    <article
      className="reader-note"
      style={{
        '--reader-note-accent': agent.annotationColor,
      } as React.CSSProperties}
    >
      <div className="reader-note-body">
        <header className="reader-note-card-header">
          <span className="reader-note-owner" style={{ background: agent.annotationColor }}>
            <AvatarBadge
              avatar={agent.avatar.startsWith('/') ? agent.avatar : undefined}
              fallback={agent.avatar.startsWith('/') ? 'AI' : agent.avatar}
            />
          </span>
          <strong className="reader-note-owner-name">{agent.nickname}</strong>
          <time className="reader-note-time">{annotation.createdAt}</time>
        </header>

        <blockquote className="reader-note-quote">
          <p className="reader-note-quote-text">{annotation.quote}</p>
        </blockquote>

        <footer className="reader-note-toolbar">
          <AgentAvatarStack agentIds={annotation.agentIds} />
          <button className="reader-note-discussion-entry" type="button" onClick={onOpenDiscussion}>
            <MessageCircle size={13} />
            <span>进入讨论区</span>
          </button>
        </footer>
      </div>
    </article>
  );
}

// ── Main Export ────────────────────────────────────────

export default function AnnotationCard({
  annotation,
  onActivate,
}: AnnotationCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '0px 0px -5% 0px', threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isDistillation = annotation.type === 'distillation';

  return (
    <>
      <div
        ref={ref}
        id={`annotation-${annotation.id}`}
        className="reveal"
        onClick={() => onActivate(annotation.id)}
      >
        {isDistillation ? (
          <DistillationCard annotation={annotation} />
        ) : (
          <DiscussionCard
            annotation={annotation}
            onOpenDiscussion={() => setModalOpen(true)}
          />
        )}
      </div>

      {!isDistillation && annotation.thoughts.length > 0 && (
        <DiscussionModal
          open={modalOpen}
          annotation={annotation}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
