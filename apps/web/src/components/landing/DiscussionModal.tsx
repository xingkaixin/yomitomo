import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { Annotation, Thought } from './data/article';
import { useAgentResolver, useLanding } from './LandingContext';

/** Simplified avatar using reader-ui's AvatarBadge. */
function AgentAvatar({ agentId, size = 28 }: { agentId: string; size?: number }) {
  const getAgent = useAgentResolver();
  const agent = getAgent(agentId);
  const isImage = agent.avatar.startsWith('/') || agent.avatar.startsWith('http');
  return (
    <span
      className="reader-avatar-badge"
      style={{
        width: size,
        height: size,
        background: isImage ? 'transparent' : agent.annotationColor,
        fontSize: size < 24 ? 9 : 11,
        flexShrink: 0,
      }}
    >
      {isImage ? (
        <img
          alt=""
          src={agent.avatar}
          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
        />
      ) : (
        agent.avatar
      )}
    </span>
  );
}

// ── Discussion Modal (mirrors desktop annotation-discussion-window) ──

type DiscussionModalProps = {
  open: boolean;
  annotation: Annotation;
  onClose: () => void;
};

export default function DiscussionModal({ open, annotation, onClose }: DiscussionModalProps) {
  const getAgent = useAgentResolver();
  const { ui } = useLanding();
  const [selectedId, setSelectedId] = useState<string>(annotation.thoughts[0]?.id ?? '');

  // Reset selection when opening
  useEffect(() => {
    if (open && annotation.thoughts.length > 0) {
      setSelectedId(annotation.thoughts[0].id);
    }
  }, [open, annotation.id, annotation.thoughts]);

  if (!open) return null;

  const selectedThought = annotation.thoughts.find((t) => t.id === selectedId);

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="discussion-modal-overlay is-open">
          <Dialog.Popup className="discussion-modal-panel" aria-label={ui.discussionLabel}>
            <div className="annotation-discussion-window">
              {/* Quote area */}
              <section className="annotation-discussion-quote">
                <strong>{ui.quoteLabel}</strong>
                <p>{annotation.quote}</p>
              </section>

              {/* Two-column layout */}
              <div className="annotation-discussion-layout">
                {/* Left sidebar: thought list */}
                <aside className="annotation-discussion-ideas">
                  <div className="annotation-discussion-ideas-header">
                    <strong>{ui.ideasLabel}</strong>
                    <span className="annotation-discussion-ideas-count">
                      {annotation.thoughts.length}
                    </span>
                  </div>

                  <div className="annotation-discussion-idea-list">
                    {annotation.thoughts.map((thought) => {
                      const author = getAgent(thought.authorId);
                      return (
                        <button
                          key={thought.id}
                          type="button"
                          className={`annotation-discussion-idea${selectedId === thought.id ? ' is-selected' : ''}`}
                          onClick={() => setSelectedId(thought.id)}
                        >
                          <div className="annotation-discussion-idea-main">
                            <AgentAvatar agentId={thought.authorId} />
                            <div className="annotation-discussion-idea-text">
                              <strong>{author.nickname}</strong>
                              <em>{thought.content}</em>
                              {thought.comments.length > 0 && (
                                <small>{ui.replies(thought.comments.length)}</small>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </aside>

                {/* Right main: thread view */}
                <div className="annotation-discussion-thread">
                  {selectedThought ? (
                    <ThreadView thought={selectedThought} />
                  ) : (
                    <div className="annotation-discussion-thread-placeholder">
                      <p>{ui.selectThought}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Close button */}
            <button
              className="discussion-modal-close"
              type="button"
              onClick={onClose}
              aria-label="关闭"
            >
              <X size={16} />
            </button>
          </Dialog.Popup>
        </Dialog.Backdrop>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Thread View ─────────────────────────────────────

function ThreadView({ thought }: { thought: Thought }) {
  const { ui } = useLanding();
  const messagesRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when thought changes
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [thought.id]);

  return (
    <div className="annotation-discussion-thread-body">
      {/* Root thought (想法) — no author name or avatar, just the idea itself */}
      <div className="annotation-discussion-root-thought">
        <div className="annotation-discussion-markdown">
          <p>{thought.content}</p>
        </div>
      </div>

      {/* Divider hugging the thought */}
      {thought.comments.length > 0 && (
        <div className="annotation-discussion-thread-divider">
          <span />
          <span>{ui.discussionLabel}</span>
          <span />
        </div>
      )}

      {/* Comments appear right below the divider */}
      <div className="annotation-discussion-messages" ref={messagesRef}>
        {thought.comments.map((comment) => (
          <MessageBubble key={comment.id} comment={comment} />
        ))}
      </div>
    </div>
  );
}

// ── Message Bubble ──────────────────────────────────

function MessageBubble({
  comment,
}: {
  comment: { id: string; authorId: string; content: string };
}) {
  const getAgent = useAgentResolver();
  const author = getAgent(comment.authorId);
  const isYomitomo = comment.authorId === 'yomitomo';

  return (
    <div className={`annotation-discussion-message${isYomitomo ? ' is-yomitomo' : ''}`}>
      <AgentAvatar agentId={comment.authorId} />
      <div className="annotation-discussion-message-bubble">
        <div className="annotation-discussion-message-header">
          <strong>{author.nickname}</strong>
        </div>
        <div className="annotation-discussion-markdown">
          <p>{comment.content}</p>
        </div>
      </div>
    </div>
  );
}
