import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Layers2 } from 'lucide-react';
import {
  ReadonlyAnnotationCard,
  type ReadonlyAnnotationCardAuthor,
  type ReadonlyAnnotationCardThought,
} from '@yomitomo/reader-ui/reader-readonly-annotation-card';
import type { Annotation } from '../data/article';
import DiscussionModal from './DiscussionModal';

type AnnotationCardProps = {
  annotation: Annotation;
  isActive: boolean;
  onActivate: (id: string | null) => void;
};

/** Map article data author to ReadonlyAnnotationCard's author shape. */
function toAuthor(author: Annotation['author']): ReadonlyAnnotationCardAuthor {
  return {
    color: author.color,
    fallback: author.initials,
    name: author.name,
  };
}

/** Map article comments to ReadonlyAnnotationCard thoughts. */
function toThoughts(annotation: Annotation): ReadonlyAnnotationCardThought[] {
  if (annotation.type === 'note' && annotation.content) {
    return [
      {
        id: `${annotation.id}-thought`,
        author: toAuthor(annotation.author),
        content: annotation.content,
        createdAt: annotation.createdAt,
      },
    ];
  }
  return [];
}

// ── Note Card ──────────────────────────────────────────

function NoteCard({ annotation }: { annotation: Annotation }) {
  return (
    <ReadonlyAnnotationCard
      id={annotation.id}
      quote={annotation.quote}
      author={toAuthor(annotation.author)}
      createdAt={annotation.createdAt}
      thoughts={toThoughts(annotation)}
    />
  );
}

// ── Discussion Card ────────────────────────────────────

function DiscussionCard({
  annotation,
  onOpenDiscussion,
}: {
  annotation: Annotation;
  onOpenDiscussion: () => void;
}) {
  const thoughts: ReadonlyAnnotationCardThought[] = (annotation.comments ?? []).map((c) => ({
    id: c.id,
    author: {
      color: c.author.color,
      fallback: c.author.initials,
      name: c.author.name,
    },
    content: c.content,
    createdAt: annotation.createdAt,
  }));

  return (
    <ReadonlyAnnotationCard
      id={annotation.id}
      quote={annotation.quote}
      author={toAuthor(annotation.author)}
      createdAt={annotation.createdAt}
      thoughts={thoughts}
      action={{
        icon: <MessageCircle size={14} />,
        label: '进入讨论区',
        onClick: onOpenDiscussion,
      }}
    />
  );
}

// ── Distillation Card (mirrors desktop AnnotationCard has-distillation) ──

function DistillationCard({ annotation }: { annotation: Annotation }) {
  return (
    <article
      className="reader-note has-distillation"
      style={{
        '--reader-note-accent': annotation.author.color,
      } as React.CSSProperties}
    >
      <div className="reader-note-body">
        {/* SVG ticket shape — identical to desktop reader-annotation-card.tsx */}
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

  return (
    <>
      <div
        ref={ref}
        id={`annotation-${annotation.id}`}
        className="reveal"
        onClick={() => onActivate(annotation.id)}
      >
        {annotation.type === 'note' && <NoteCard annotation={annotation} />}
        {annotation.type === 'discussion' && (
          <DiscussionCard
            annotation={annotation}
            onOpenDiscussion={() => setModalOpen(true)}
          />
        )}
        {annotation.type === 'distillation' && (
          <DistillationCard annotation={annotation} />
        )}
      </div>

      {annotation.type === 'discussion' && annotation.comments && (
        <DiscussionModal
          open={modalOpen}
          quote={annotation.quote}
          comments={annotation.comments}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
