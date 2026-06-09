import { useEffect, useRef, useState } from 'react';
import { X, Bot } from 'lucide-react';
import type { Annotation, Thought, Comment } from '../data/article';

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
      className="reader-avatar-badge"
      style={{
        backgroundColor: color,
        color: 'white',
        fontSize: 11,
        fontWeight: 800,
      }}
    >
      {isAgent ? <Bot size={12} /> : initials}
    </div>
  );
}

// ── Discussion Modal (mirrors desktop annotation-discussion-window layout) ──

type DiscussionModalProps = {
  open: boolean;
  annotation: Annotation;
  onClose: () => void;
};

export default function DiscussionModal({
  open,
  annotation,
  onClose,
}: DiscussionModalProps) {
  const [selectedId, setSelectedId] = useState<string>(annotation.thoughts[0]?.id ?? '');
  const panelRef = useRef<HTMLDivElement>(null);

  // Reset selection when opening or switching annotations
  useEffect(() => {
    if (open && annotation.thoughts.length > 0) {
      setSelectedId(annotation.thoughts[0].id);
    }
  }, [open, annotation.id, annotation.thoughts]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Lock body scroll
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

  if (!open) return null;

  const selectedThought = annotation.thoughts.find((t) => t.id === selectedId);

  return (
    <div
      className={`discussion-modal-overlay${open ? ' is-open' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="讨论区"
    >
      <div className="discussion-modal-panel" ref={panelRef}>
        {/* Window structure mirrors desktop annotation-discussion-window */}
        <div className="annotation-discussion-window">
          {/* Quote area */}
          <section className="annotation-discussion-quote">
            <strong>引文</strong>
            <p>{annotation.quote}</p>
          </section>

          {/* Two-column layout */}
          <div className="annotation-discussion-layout">
            {/* Left sidebar: thought list */}
            <aside className="annotation-discussion-ideas">
              <div className="annotation-discussion-ideas-header">
                <strong>想法</strong>
                <span className="annotation-discussion-ideas-count">
                  {annotation.thoughts.length}
                </span>
              </div>

              <div className="annotation-discussion-idea-list">
                {annotation.thoughts.map((thought) => (
                  <button
                    key={thought.id}
                    type="button"
                    className={`annotation-discussion-idea${selectedId === thought.id ? ' is-selected' : ''}`}
                    onClick={() => setSelectedId(thought.id)}
                  >
                    <div className="annotation-discussion-idea-main">
                      <Avatar
                        initials={thought.author.initials}
                        color={thought.author.color}
                        isAgent={thought.author.isAgent}
                      />
                      <div className="annotation-discussion-idea-text">
                        <strong>{thought.author.name}</strong>
                        <em>{thought.content}</em>
                        {thought.comments.length > 0 && (
                          <small>{thought.comments.length} 条回复</small>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            {/* Right main: thread view */}
            <div className="annotation-discussion-thread">
              {selectedThought ? (
                <ThreadView thought={selectedThought} />
              ) : (
                <div className="annotation-discussion-thread-placeholder">
                  <p>选择一条想法查看讨论</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Close button overlay */}
        <button
          className="discussion-modal-close"
          type="button"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Thread View ─────────────────────────────────────

function ThreadView({ thought }: { thought: Thought }) {
  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when thought changes
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [thought.id]);

  return (
    <>
      <div className="annotation-discussion-thread-header">
        <strong>讨论</strong>
      </div>

      <div className="annotation-discussion-thread-body">
        {/* Root thought */}
        <div className="annotation-discussion-root-thought">
          <div className="annotation-discussion-root-thought-header">
            <Avatar
              initials={thought.author.initials}
              color={thought.author.color}
              isAgent={thought.author.isAgent}
            />
            <strong>{thought.author.name}</strong>
          </div>
          <div className="annotation-discussion-markdown">
            <p>{thought.content}</p>
          </div>
        </div>

        {/* Divider */}
        {thought.comments.length > 0 && (
          <div className="annotation-discussion-thread-divider">
            <span />
            <span>讨论</span>
            <span />
          </div>
        )}

        {/* Comments */}
        <div className="annotation-discussion-messages" ref={messagesRef}>
          {thought.comments.map((comment) => (
            <MessageBubble key={comment.id} comment={comment} />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Message Bubble ──────────────────────────────────

function MessageBubble({ comment }: { comment: Comment }) {
  const isUser = !comment.author.isAgent;

  return (
    <div
      className={`annotation-discussion-message${isUser ? ' is-user' : ''}`}
    >
      <Avatar
        initials={comment.author.initials}
        color={comment.author.color}
        isAgent={comment.author.isAgent}
      />
      <div className="annotation-discussion-message-bubble">
        <div className="annotation-discussion-message-header">
          <strong>{comment.author.name}</strong>
        </div>
        <div className="annotation-discussion-markdown">
          <p>{comment.content}</p>
        </div>
      </div>
    </div>
  );
}
