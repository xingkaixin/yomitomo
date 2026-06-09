import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Layers2, Clock, Bot } from 'lucide-react';
import type { Annotation } from '../data/article';
import DiscussionModal from './DiscussionModal';

type AnnotationCardProps = {
  annotation: Annotation;
  isActive: boolean;
  onActivate: (id: string | null) => void;
};

function Avatar({
  initials,
  color,
  isAgent,
}: {
  initials: string;
  color: string;
  isAgent?: boolean;
}) {
  return (
    <div
      className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
      style={{ backgroundColor: color }}
      title={isAgent ? 'AI 助手' : undefined}
    >
      {isAgent ? <Bot size={12} /> : initials}
    </div>
  );
}

function NoteCard({ annotation, isActive }: { annotation: Annotation; isActive: boolean }) {
  return (
    <div
      className={`annotation-card p-4 ${isActive ? 'is-active' : ''}`}
    >
      <div className="flex gap-3">
        <div className="quote-bar" />
        <div className="flex-1 space-y-3">
          <p className="text-sm leading-relaxed text-[#5a4d3e] italic">
            「{annotation.quote}」
          </p>
          <div className="flex items-center gap-2">
            <Avatar initials={annotation.author.initials} color={annotation.author.color} />
            <span className="text-xs font-medium text-[#2a2218]">{annotation.author.name}</span>
            <span className="text-xs text-[#9e9285]">{annotation.createdAt}</span>
          </div>
          <p className="text-sm leading-relaxed text-[#3a3028]">{annotation.content}</p>
        </div>
      </div>
    </div>
  );
}

function DiscussionCard({
  annotation,
  isActive,
  onOpenDiscussion,
}: {
  annotation: Annotation;
  isActive: boolean;
  onOpenDiscussion: () => void;
}) {
  const commentCount = annotation.comments?.length ?? 0;

  return (
    <div className={`annotation-card overflow-hidden ${isActive ? 'is-active' : ''}`}>
      <div className="p-4">
        <div className="flex gap-3">
          <div className="quote-bar" />
          <div className="flex-1 space-y-2">
            <p className="text-sm leading-relaxed text-[#5a4d3e] italic">
              「{annotation.quote}」
            </p>
            <div className="flex items-center gap-2">
              <Avatar initials={annotation.author.initials} color={annotation.author.color} isAgent />
              <span className="text-xs font-medium text-[#2a2218]">{annotation.author.name}</span>
              <span className="text-xs text-[#9e9285]">{annotation.createdAt}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer: discussion summary + enter button */}
      <div className="flex items-center justify-between border-t border-[#e8e0d4] bg-[#faf8f5] px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs text-[#7a6e5f]">
          <MessageCircle size={13} />
          {commentCount} 条讨论
        </span>
        <button
          type="button"
          className="discussion-entry-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDiscussion();
          }}
        >
          <MessageCircle size={14} />
          进入讨论区
        </button>
      </div>
    </div>
  );
}

function DistillationCard({
  annotation,
  isActive,
}: {
  annotation: Annotation;
  isActive: boolean;
}) {
  return (
    <div
      className={`distillation-card p-5 ${isActive ? 'ring-2 ring-[#f4c95d]/60' : ''}`}
    >
      <div className="ticket-notch" aria-hidden="true" />
      <div className="mb-3 flex items-center gap-2">
        <Layers2 size={14} className="text-[#b8860b]" />
        <span className="text-xs font-medium tracking-wider text-[#8a7a60] uppercase">
          沉淀
        </span>
      </div>

      <div className="mb-4 flex gap-3">
        <div className="quote-bar" />
        <p className="text-sm leading-relaxed text-[#5a4d3e] italic">
          「{annotation.quote}」
        </p>
      </div>

      <p className="text-sm leading-[1.8] text-[#3a3028]">{annotation.content}</p>

      <div className="mt-4 flex items-center gap-1.5 text-xs text-[#9e9285]">
        <Clock size={12} />
        <span>{annotation.createdAt}</span>
      </div>
    </div>
  );
}

export default function AnnotationCard({
  annotation,
  isActive,
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
        {annotation.type === 'note' && <NoteCard annotation={annotation} isActive={isActive} />}
        {annotation.type === 'discussion' && (
          <DiscussionCard
            annotation={annotation}
            isActive={isActive}
            onOpenDiscussion={() => setModalOpen(true)}
          />
        )}
        {annotation.type === 'distillation' && (
          <DistillationCard annotation={annotation} isActive={isActive} />
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
