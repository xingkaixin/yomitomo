import { useEffect, useRef, useState } from 'react';
import { Layers2 } from 'lucide-react';
import {
  ReadonlyAnnotationCard,
  type ReadonlyAnnotationCardAuthor,
  type ReadonlyAnnotationCardThought,
} from '@yomitomo/reader-ui/reader-readonly-annotation-card';
import type { Annotation } from '../data/article';
import DiscussionModal from './DiscussionModal';

type AnnotationCardProps = {
  annotation: Annotation;
  onActivate: (id: string | null) => void;
};

function toAuthor(author: Annotation['author']): ReadonlyAnnotationCardAuthor {
  return {
    color: author.color,
    fallback: author.initials,
    name: author.name,
  };
}

/** Build placeholder thoughts so ReadonlyAnnotationCard shows the count badge. */
function countOnlyThoughts(annotation: Annotation): ReadonlyAnnotationCardThought[] {
  return annotation.thoughts.map((t) => ({
    id: t.id,
    author: { color: t.author.color, fallback: t.author.initials, name: t.author.name },
    content: '',
    createdAt: annotation.createdAt,
  }));
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

  const isDistillation = annotation.type === 'distillation';
  const hasDiscussion = annotation.type !== 'distillation' && annotation.thoughts.length > 0;

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
          <ReadonlyAnnotationCard
            id={annotation.id}
            quote={annotation.quote}
            author={toAuthor(annotation.author)}
            createdAt={annotation.createdAt}
            thoughts={countOnlyThoughts(annotation)}
            action={
              hasDiscussion
                ? {
                    label: '进入讨论区',
                    onClick: () => setModalOpen(true),
                  }
                : undefined
            }
          />
        )}
      </div>

      {hasDiscussion && (
        <DiscussionModal
          open={modalOpen}
          annotation={annotation}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
