import { useEffect, useRef, useState } from 'react';
import { X, Bot } from 'lucide-react';
import type { Comment } from '../data/article';

function Avatar({
  initials,
  color,
  size = 28,
  isAgent,
}: {
  initials: string;
  color: string;
  size?: number;
  isAgent?: boolean;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size < 24 ? 10 : 11,
      }}
    >
      {isAgent ? <Bot size={size * 0.45} /> : initials}
    </div>
  );
}

type DiscussionModalProps = {
  open: boolean;
  quote: string;
  comments: Comment[];
  onClose: () => void;
};

export default function DiscussionModal({
  open,
  quote,
  comments,
  onClose,
}: DiscussionModalProps) {
  const [selectedId, setSelectedId] = useState<string>(comments[0]?.id ?? '');
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset selection when opening
  useEffect(() => {
    if (open && comments.length > 0) {
      setSelectedId(comments[0].id);
    }
  }, [open, comments]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Close on click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const selectedComment = comments.find((c) => c.id === selectedId);

  if (!open) return null;

  return (
    <div
      className={`modal-overlay${open ? ' is-open' : ''}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="讨论区"
    >
      <div className="modal-panel modal-panel--two-column" ref={panelRef}>
        {/* Header */}
        <div className="modal-header">
          <strong>讨论区</strong>
          <button type="button" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>

        {/* Left sidebar: idea list */}
        <aside className="modal-sidebar">
          <div className="modal-sidebar-header">想法</div>
          {comments.map((comment) => (
            <button
              key={comment.id}
              type="button"
              className={`modal-sidebar-item${selectedId === comment.id ? ' is-active' : ''}`}
              onClick={() => setSelectedId(comment.id)}
            >
              <Avatar
                initials={comment.author.initials}
                color={comment.author.color}
                size={24}
                isAgent={comment.author.isAgent}
              />
              <div className="min-w-0">
                <div className="modal-sidebar-item-text">
                  {comment.content}
                </div>
                <div className="modal-sidebar-item-author">
                  {comment.author.name}
                </div>
              </div>
            </button>
          ))}
        </aside>

        {/* Right main: discussion detail */}
        <div className="modal-main">
          <div className="modal-body space-y-4">
            {/* Quote */}
            <div className="rounded-lg border-l-[3px] border-[#f4c95d] bg-[#fdf6e3] px-4 py-3">
              <p className="text-sm italic leading-relaxed text-[#5a4d3e]">
                「{quote}」
              </p>
            </div>

            {/* Selected comment detail */}
            {selectedComment && (
              <div className="rounded-xl border border-[#e8e0d4] bg-[#faf8f5] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Avatar
                    initials={selectedComment.author.initials}
                    color={selectedComment.author.color}
                    size={28}
                    isAgent={selectedComment.author.isAgent}
                  />
                  <div>
                    <span className="text-xs font-semibold text-[#2a2218]">
                      {selectedComment.author.name}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-[#3a3028]">
                  {selectedComment.content}
                </p>
              </div>
            )}

            {/* Full thread */}
            <div className="space-y-3 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#9e9285]">
                完整讨论
              </p>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className={`flex gap-2.5 ${comment.author.isAgent ? '' : 'flex-row-reverse'}`}
                >
                  <Avatar
                    initials={comment.author.initials}
                    color={comment.author.color}
                    size={24}
                    isAgent={comment.author.isAgent}
                  />
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      comment.author.isAgent
                        ? 'chat-bubble-agent rounded-tl-sm'
                        : 'chat-bubble-user rounded-tr-sm'
                    }`}
                  >
                    <p className="text-[#3a3028]">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
