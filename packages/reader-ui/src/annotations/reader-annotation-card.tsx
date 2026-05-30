import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, MessageCircle, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationPersona as annotationAuthor, commentPersona } from '@yomitomo/core';
import { AvatarBadge, ReaderTooltip } from '../shared/reader-component-primitives';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import { noteStyle } from '../reader-style-utils';
import type { AnnotationRailSide } from './reader-annotations';

type AvatarColorStyle = React.CSSProperties & {
  '--reader-avatar-color': string;
};

type DeleteHoldStyle = React.CSSProperties & {
  '--delete-hold-ms': string;
};

const DELETE_HOLD_MS = 1600;

export function AnnotationCard({
  active,
  agents,
  annotation,
  exiting = false,
  isStackFront = true,
  noteRef,
  railSide = 'right',
  reviewAgents = [],
  stackCount = 1,
  stackIndex = 0,
  style,
  userProfile,
  onDelete,
  onFocus,
  onOpenDiscussion,
  pendingAgents = [],
}: {
  active: boolean;
  agents: PublicAgent[];
  annotation: Annotation;
  exiting?: boolean;
  isStackFront?: boolean;
  messageSendShortcut: MessageSendShortcut;
  noteRef: (element: HTMLElement | null) => void;
  primaryCommentExpanded: boolean;
  railSide?: AnnotationRailSide;
  reviewAgents?: PublicAgent[];
  shortcutModifier: string;
  stackCount?: number;
  stackIndex?: number;
  commentsCloseKey: number;
  style?: React.CSSProperties;
  userProfile: UserProfile;
  onAddComment: (annotationId: string, content: string, replyTo?: string) => void;
  onDelete: (annotationId: string) => void;
  onDeleteComment?: (annotationId: string, commentId: string) => void;
  onFocus: (annotationId: string) => void;
  onOpenDiscussion?: (annotationId: string) => void;
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
  pendingAgents?: PublicAgent[];
}) {
  const personaAgents = useMemo(() => [...agents, ...reviewAgents], [agents, reviewAgents]);
  const author = annotationAuthor(annotation, userProfile, personaAgents);
  const discussionThreads = useMemo(() => annotationDiscussionThreads(annotation), [annotation]);
  const visibleThoughtCount = discussionThreads.length + pendingAgents.length;
  const thoughtAuthors = useMemo(
    () => uniqueThoughtAuthors(discussionThreads, userProfile, personaAgents),
    [discussionThreads, personaAgents, userProfile],
  );
  const assistantParticipants = useMemo(
    () => uniqueAssistantParticipants(annotation.comments, userProfile, personaAgents),
    [annotation.comments, personaAgents, userProfile],
  );
  const assistantSummary = assistantParticipationSummary(assistantParticipants, pendingAgents);
  const assistantSummaryId = `annotation-${annotation.id}-assistant-summary`;
  const thoughtSummaryId = `annotation-${annotation.id}-thought-summary`;
  const discussionSummaryLabel = `${visibleThoughtCount} 条想法，${assistantSummary}`;
  const summaryBusy = pendingAgents.length > 0;
  const summaryClassName = [
    'reader-note-discussion-summary',
    summaryBusy ? 'is-busy' : '',
    visibleThoughtCount === 0 ? 'is-empty' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const toolbarClassName = ['reader-note-toolbar', 'reader-note-summary-toolbar']
    .filter(Boolean)
    .join(' ');
  const noteClassName = [
    'reader-note',
    active ? 'is-active' : '',
    exiting ? 'is-filtering-out' : '',
    stackCount > 1 ? 'is-stacked' : '',
    isStackFront ? 'is-stack-front' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const annotationStyle = {
    ...noteStyle(author.color, active),
    '--reader-note-accent': author.color || annotation.color,
    ...style,
  } as React.CSSProperties;

  const setNoteElement = useCallback(
    (element: HTMLElement | null) => {
      noteRef(element);
    },
    [noteRef],
  );

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (active) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button,textarea,input,a,[role="button"]')) return;
    onFocus(annotation.id);
  }

  function openDiscussion() {
    if (!active) onFocus(annotation.id);
    onOpenDiscussion?.(annotation.id);
  }

  return (
    <section
      className={noteClassName}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      data-annotation-id={annotation.id}
      data-rail-side={railSide}
      ref={setNoteElement}
      style={annotationStyle}
      onClick={handleCardClick}
    >
      <div className="reader-note-body">
        <header className="reader-note-card-header">
          <button
            className="reader-note-quote"
            type="button"
            onClick={() => onFocus(annotation.id)}
          >
            <span className="reader-note-quote-mark" aria-hidden="true">
              “
            </span>
            <span className="reader-note-quote-text">{annotation.anchor.exact}</span>
          </button>
        </header>
        <div className="reader-note-meta">
          <span
            className="reader-note-owner"
            style={avatarColorStyle(author.color)}
            aria-hidden="true"
          >
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
          </span>
          <span className="reader-note-meta-copy">
            <strong>{author.nickname}</strong>
            <ReaderRelativeTime value={annotation.createdAt} />
          </span>
          <DeleteActionMenu
            ariaLabel="打开批注操作"
            className="reader-note-action-menu"
            deleteAriaLabel="长按删除批注"
            onDelete={() => onDelete(annotation.id)}
          />
        </div>
        <footer className={toolbarClassName}>
          <div
            className={summaryClassName}
            id={thoughtSummaryId}
            aria-label={discussionSummaryLabel}
          >
            <span className="reader-note-thread-toggle-main">
              <span
                className="reader-comment-count"
                aria-label={`${visibleThoughtCount} 条想法${
                  pendingAgents.length > 0 ? '，助手处理中' : ''
                }`}
              >
                <span>{visibleThoughtCount}</span>
                <Lightbulb size={14} />
              </span>
              <ThoughtAuthorStack authors={thoughtAuthors} />
              <PendingAgentStack agents={pendingAgents} />
            </span>
            <span className="reader-note-assistant-summary" id={assistantSummaryId}>
              {assistantSummary}
            </span>
          </div>
          <button
            className="reader-note-discussion-entry"
            type="button"
            aria-label="进入讨论区"
            aria-describedby={`${thoughtSummaryId} ${assistantSummaryId}`}
            onClick={openDiscussion}
          >
            <MessageCircle size={14} />
            <span>进入讨论区</span>
          </button>
        </footer>
      </div>
    </section>
  );
}

type DiscussionThread = {
  root: Annotation['comments'][number];
  replies: Annotation['comments'];
};

type ThoughtAuthor = ReturnType<typeof commentPersona> & { key: string };

const MAX_FOOTER_AUTHORS = 4;

function ThoughtAuthorStack({ authors }: { authors: ThoughtAuthor[] }) {
  if (authors.length === 0) return null;

  const visibleAuthors = authors.slice(0, MAX_FOOTER_AUTHORS);
  const hiddenCount = authors.length - visibleAuthors.length;

  return (
    <span
      className="reader-thought-author-stack"
      aria-label={authors.map((author) => author.nickname).join('、')}
    >
      {visibleAuthors.map((author) => (
        <span
          className="reader-thought-author-avatar"
          key={author.key}
          style={avatarColorStyle(author.color)}
          title={author.nickname}
        >
          <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        </span>
      ))}
      {hiddenCount > 0 ? <span className="reader-thought-author-more">+{hiddenCount}</span> : null}
    </span>
  );
}

function PendingAgentStack({ agents }: { agents: PublicAgent[] }) {
  if (agents.length === 0) return null;

  return (
    <span
      className="reader-pending-agent-stack"
      aria-label={`${agents.map((agent) => agent.nickname).join('、')} 正在整理想法`}
    >
      {agents.slice(0, MAX_FOOTER_AUTHORS).map((agent) => (
        <span
          className="reader-pending-agent-avatar"
          key={agent.id}
          style={avatarColorStyle(agent.annotationColor)}
          title={`${agent.nickname} 正在整理想法`}
        >
          <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
        </span>
      ))}
      {agents.length > MAX_FOOTER_AUTHORS ? (
        <span className="reader-pending-agent-more">+{agents.length - MAX_FOOTER_AUTHORS}</span>
      ) : null}
    </span>
  );
}

function uniqueThoughtAuthors(
  threads: DiscussionThread[],
  userProfile: UserProfile,
  agents: PublicAgent[],
): ThoughtAuthor[] {
  const authors: ThoughtAuthor[] = [];
  const seenKeys = new Set<string>();

  for (const thread of threads) {
    const persona = commentPersona(thread.root, userProfile, agents);
    const key = commentAuthorKey(thread.root, persona.username);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    authors.push({ ...persona, key });
  }

  return authors;
}

function uniqueAssistantParticipants(
  comments: Annotation['comments'],
  userProfile: UserProfile,
  agents: PublicAgent[],
): ThoughtAuthor[] {
  const participants: ThoughtAuthor[] = [];
  const seenKeys = new Set<string>();

  for (const comment of comments) {
    if (comment.author !== 'ai') continue;
    const persona = commentPersona(comment, userProfile, agents);
    const key = commentAuthorKey(comment, persona.username);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    participants.push({ ...persona, key });
  }

  return participants;
}

function assistantParticipationSummary(
  participants: ThoughtAuthor[],
  pendingAgents: PublicAgent[],
) {
  const names: string[] = [];
  const seenKeys = new Set<string>();

  for (const participant of participants) {
    seenKeys.add(participant.key);
    names.push(participant.nickname);
  }

  for (const agent of pendingAgents) {
    const key = `ai:${agent.id || agent.username}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    names.push(agent.nickname);
  }

  if (names.length === 0) return '暂无助手参与';

  const visibleNames = names.slice(0, 2).join('、');
  const suffix = names.length > 2 ? `等 ${names.length} 位助手` : '参与';
  const pendingSuffix = pendingAgents.length > 0 ? '，处理中' : '';
  return `${visibleNames}${suffix}${pendingSuffix}`;
}

function commentAuthorKey(comment: Annotation['comments'][number], username: string) {
  return comment.author === 'ai'
    ? `ai:${comment.agentId || comment.agentUsername || username}`
    : `user:${comment.userId || comment.userUsername || username}`;
}

function avatarColorStyle(color: string): React.CSSProperties {
  const style: AvatarColorStyle = { '--reader-avatar-color': color };
  return style;
}

function ReaderRelativeTime({ className, value }: { className?: string; value: string }) {
  return (
    <ReaderTooltip content={formatTime(value)}>
      <time className={className} dateTime={value} tabIndex={0}>
        {formatRelativeTime(value)}
      </time>
    </ReaderTooltip>
  );
}

function DeleteActionMenu({
  ariaLabel,
  className,
  deleteAriaLabel,
  onDelete,
}: {
  ariaLabel: string;
  className: string;
  deleteAriaLabel: string;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);

  function closeOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setOpen(false);
  }

  function deleteAndClose() {
    setOpen(false);
    onDelete();
  }

  return (
    <div
      className={[className, 'reader-action-menu', open ? 'is-open' : ''].filter(Boolean).join(' ')}
      onBlur={closeOnBlur}
    >
      <button
        className="reader-action-menu-button"
        type="button"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="reader-action-menu-panel t-dropdown is-open" data-origin="top-right">
          <HoldDeleteButton
            ariaLabel={deleteAriaLabel}
            className="reader-delete-note reader-action-delete"
            onDelete={deleteAndClose}
          />
        </div>
      ) : null}
    </div>
  );
}

function HoldDeleteButton({
  ariaLabel,
  className,
  iconSize = 13,
  onDelete,
}: {
  ariaLabel: string;
  className: string;
  iconSize?: number;
  onDelete: () => void;
}) {
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => stopTimer(), []);

  function stopTimer() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function clearHold() {
    stopTimer();
    setHolding(false);
  }

  function startHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (timerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      onDelete();
    }, DELETE_HOLD_MS);
  }

  return (
    <button
      className={[className, holding ? 'is-holding' : ''].filter(Boolean).join(' ')}
      style={{ '--delete-hold-ms': `${DELETE_HOLD_MS}ms` } as DeleteHoldStyle}
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={clearHold}
      onPointerDown={startHold}
      onPointerLeave={clearHold}
      onPointerUp={clearHold}
    >
      <Trash2 size={iconSize} />
      <span>长按删除</span>
    </button>
  );
}

function annotationDiscussionThreads(annotation: Annotation): DiscussionThread[] {
  const topLevelComments = annotation.comments
    .filter((comment) => !comment.replyTo)
    .toSorted(compareCommentsOldestFirst);
  const fallbackRoot = topLevelComments[0];
  const rootIds = new Set(topLevelComments.map((comment) => comment.id));
  const repliesByRoot = new Map(
    topLevelComments.map((comment) => [comment.id, [] as Annotation['comments']]),
  );

  for (const comment of annotation.comments) {
    if (rootIds.has(comment.id)) continue;
    const rootId =
      comment.replyTo && rootIds.has(comment.replyTo) ? comment.replyTo : fallbackRoot?.id;
    if (!rootId) continue;
    repliesByRoot.get(rootId)?.push(comment);
  }

  return topLevelComments.map((root) => ({
    root,
    replies: (repliesByRoot.get(root.id) || []).toSorted(compareCommentsOldestFirst),
  }));
}

function compareCommentsOldestFirst(
  a: Annotation['comments'][number],
  b: Annotation['comments'][number],
) {
  return commentTime(a) - commentTime(b);
}

function commentTime(comment: Annotation['comments'][number]) {
  const time = Date.parse(comment.createdAt);
  return Number.isNaN(time) ? 0 : time;
}
