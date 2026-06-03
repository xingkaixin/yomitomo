import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { MoreHorizontal, Pin, PinOff, Trash2 } from 'lucide-react';
import type { UserProfile } from '@yomitomo/shared';
import { commentPersona } from '@yomitomo/core';
import { AvatarBadge } from '@yomitomo/reader-ui/reader-component-primitives';
import { formatRelativeTime, type DiscussionThread } from './app-annotation-discussion-utils';

const DISCUSSION_DELETE_HOLD_MS = 900;

export function ThoughtListItem({
  isDeleting,
  isSelected,
  onDelete,
  onPin,
  onSelect,
  thread,
  userProfile,
}: {
  isDeleting: boolean;
  isSelected: boolean;
  onDelete: () => void;
  onPin: () => void;
  onSelect: () => void;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const author = commentPersona(thread.root, userProfile, []);
  const itemClassName = [
    'annotation-discussion-idea',
    isSelected ? 'is-selected' : '',
    thread.isPinned ? 'is-pinned' : '',
    thread.pending ? 'is-pending' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={itemClassName}>
      <button className="annotation-discussion-idea-main" type="button" onClick={onSelect}>
        <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        <span>
          <strong>{author.nickname}</strong>
          <em>{thread.root.content}</em>
          <small>
            {formatRelativeTime(thread.updatedAt)} · {thread.replyCount} 条回复
            {thread.pending ? ' · 处理中' : ''}
          </small>
        </span>
      </button>
      <div
        className="annotation-discussion-idea-actions"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setMenuOpen(false);
        }}
      >
        <button
          className={menuOpen ? 'is-active' : ''}
          type="button"
          aria-label="更多想法操作"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((current) => !current);
          }}
        >
          <MoreHorizontal size={14} />
        </button>
        {menuOpen ? (
          <div className="annotation-discussion-idea-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={(event) => {
                event.stopPropagation();
                onPin();
                setMenuOpen(false);
              }}
            >
              {thread.isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              <span>{thread.isPinned ? '取消固定' : '固定置顶'}</span>
            </button>
            <LongPressDeleteButton
              className="annotation-discussion-idea-delete"
              disabled={isDeleting}
              label="长按删除想法和回复"
              onDelete={onDelete}
              onComplete={() => setMenuOpen(false)}
            >
              <Trash2 size={13} />
              <span>长按删除</span>
            </LongPressDeleteButton>
          </div>
        ) : null}
      </div>
      {thread.isPinned ? (
        <span className="annotation-discussion-idea-pin-badge" aria-label="已置顶">
          <Pin size={10} />
        </span>
      ) : null}
    </article>
  );
}

export function LongPressDeleteButton({
  children,
  className,
  disabled,
  label,
  onComplete,
  onDelete,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  label: string;
  onComplete?: () => void;
  onDelete: () => void;
}) {
  const deleteTimerRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  useEffect(
    () => () => {
      if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    },
    [],
  );

  function stopHold() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
    setHolding(false);
  }

  function startHold(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (disabled || deleteTimerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      setHolding(false);
      onDelete();
      onComplete?.();
    }, DISCUSSION_DELETE_HOLD_MS);
  }

  return (
    <button
      className={['annotation-discussion-hold-delete', holding ? 'is-holding' : '', className || '']
        .filter(Boolean)
        .join(' ')}
      style={{ '--delete-hold-ms': `${DISCUSSION_DELETE_HOLD_MS}ms` } as CSSProperties}
      type="button"
      disabled={disabled}
      aria-label={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerCancel={stopHold}
      onPointerDown={startHold}
      onPointerLeave={stopHold}
      onPointerUp={stopHold}
    >
      {children}
    </button>
  );
}
