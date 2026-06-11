import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers2,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Quote,
  Trash2,
} from 'lucide-react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationPersona as annotationAuthor, commentPersona } from '@yomitomo/core';
import { AvatarBadge, ReaderTooltip } from '../shared/reader-component-primitives';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import { noteStyle } from '../reader-style-utils';
import type { AnnotationRailSide } from './reader-annotations';
import type { ReaderUiLabels } from '../shell/reader-app-view-types';
import { defaultReaderUiLabels } from '../shell/reader-app-view-types';

type AvatarColorStyle = React.CSSProperties & {
  '--reader-avatar-color': string;
};

export type ReaderWindowSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function AnnotationCard({
  active,
  agents,
  annotation,
  distillationAnimation,
  exiting = false,
  isStackFront = true,
  labels = defaultReaderUiLabels,
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
  distillationAnimation?: {
    annotationId: string;
    transition: 'publish' | 'update' | 'unpublish';
    phase: 'morph-out' | 'morph-in' | 'update' | 'unpublish-wobble';
    token: number;
  } | null;
  exiting?: boolean;
  isStackFront?: boolean;
  labels?: ReaderUiLabels;
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
  onOpenDiscussion?: (annotationId: string, sourceRect?: ReaderWindowSourceRect) => void;
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
  pendingAgents?: PublicAgent[];
}) {
  const personaAgents = useMemo(() => [...agents, ...reviewAgents], [agents, reviewAgents]);
  const author = annotationAuthor(annotation, userProfile, personaAgents);
  const discussionThreads = useMemo(() => annotationDiscussionThreads(annotation), [annotation]);
  const visibleThoughtCount = discussionThreads.length + pendingAgents.length;
  const assistantParticipants = useMemo(
    () => uniqueAssistantParticipants(annotation.comments, userProfile, personaAgents),
    [annotation.comments, personaAgents, userProfile],
  );
  const summaryBusy = pendingAgents.length > 0;
  const assistantSummary = assistantParticipationSummary(
    assistantParticipants,
    pendingAgents,
    labels,
  );
  const thoughtSummaryId = `annotation-${annotation.id}-thought-summary`;
  const discussionSummaryLabel = `${labels.thoughtSummary(visibleThoughtCount, false)}，${assistantSummary}`;
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
    annotation.distillation?.status === 'published' ? 'has-distillation' : 'has-discussion',
    distillationAnimation ? `is-distillation-${distillationAnimation.phase}` : '',
    exiting ? 'is-filtering-out' : '',
    stackCount > 1 ? 'is-stacked' : '',
    isStackFront ? 'is-stack-front' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const distillationContent = annotation.distillation?.content.trim() || '';
  const displaysDistillation =
    annotation.distillation?.status === 'published' && distillationContent.length > 0;
  const annotationStyle = {
    ...(displaysDistillation ? {} : noteStyle(author.color, active)),
    '--reader-note-accent': author.color || annotation.color,
    ...style,
  } as React.CSSProperties;
  const displayedText = displaysDistillation ? distillationContent : annotation.anchor.exact;
  const distillationPublishedAt =
    annotation.distillation?.updatedAt ||
    annotation.distillation?.publishedAt ||
    annotation.updatedAt;

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

  function openDiscussion(sourceElement: Element) {
    if (!active) onFocus(annotation.id);
    onOpenDiscussion?.(annotation.id, elementWindowSourceRect(sourceElement));
  }

  return (
    <section
      className={noteClassName}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      data-annotation-id={annotation.id}
      data-rail-side={railSide}
      data-distillation-animation={distillationAnimation?.token}
      ref={setNoteElement}
      style={annotationStyle}
      onClick={handleCardClick}
    >
      <div className="reader-note-body">
        {displaysDistillation ? (
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
        ) : null}
        <header className="reader-note-card-header">
          {!displaysDistillation ? (
            <>
              <span className="reader-note-quote-badge" aria-hidden="true">
                <Quote size={18} strokeWidth={2.35} />
              </span>
              <span className="reader-note-left-line" aria-hidden="true" />
              <span className="reader-note-background-quote" aria-hidden="true">
                ”
              </span>
            </>
          ) : null}
          <button
            className="reader-note-quote"
            type="button"
            onClick={() => onFocus(annotation.id)}
          >
            {displaysDistillation ? null : (
              <span className="reader-note-quote-mark" aria-hidden="true">
                “
              </span>
            )}
            <span className="reader-note-quote-text">{displayedText}</span>
          </button>
        </header>
        {displaysDistillation ? (
          <>
            <DeleteActionMenu
              ariaLabel={labels.openDistillationActions}
              className="reader-note-action-menu reader-note-distillation-menu"
              deleteAriaLabel={labels.deleteHighlight}
              discussionAriaLabel={labels.enterDiscussion}
              labels={labels}
              onDelete={() => onDelete(annotation.id)}
              onOpenDiscussion={openDiscussion}
            />
            <footer className="reader-note-toolbar reader-note-distillation-footer">
              <span className="reader-note-distillation-badge" aria-hidden="true">
                <Layers2 size={16} strokeWidth={1.9} />
              </span>
              <ReaderRelativeTime
                className="reader-note-distillation-time"
                value={distillationPublishedAt}
              />
            </footer>
          </>
        ) : (
          <>
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
                ariaLabel={labels.openHighlightActions}
                className="reader-note-action-menu"
                deleteAriaLabel={labels.deleteHighlight}
                labels={labels}
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
                    aria-label={labels.thoughtSummary(
                      visibleThoughtCount,
                      pendingAgents.length > 0,
                    )}
                  >
                    <span>{visibleThoughtCount}</span>
                    <Lightbulb size={14} />
                  </span>
                  <ThoughtAuthorStack authors={assistantParticipants} />
                  <PendingAgentStack agents={pendingAgents} labels={labels} />
                </span>
              </div>
              <button
                className="reader-note-discussion-entry"
                type="button"
                aria-label={labels.enterDiscussion}
                aria-describedby={thoughtSummaryId}
                onClick={(event) => openDiscussion(event.currentTarget)}
              >
                <MessageCircle size={14} />
                <span>{labels.enterDiscussion}</span>
              </button>
            </footer>
          </>
        )}
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
        >
          <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
        </span>
      ))}
      {hiddenCount > 0 ? <span className="reader-thought-author-more">+{hiddenCount}</span> : null}
    </span>
  );
}

function PendingAgentStack({
  agents,
  labels = defaultReaderUiLabels,
}: {
  agents: PublicAgent[];
  labels?: ReaderUiLabels;
}) {
  if (agents.length === 0) return null;

  return (
    <span
      className="reader-pending-agent-stack"
      aria-label={`${agents.map((agent) => agent.nickname).join('、')} ${labels.annotationProcessing}`}
    >
      {agents.slice(0, MAX_FOOTER_AUTHORS).map((agent) => (
        <span
          className="reader-pending-agent-avatar"
          key={agent.id}
          style={avatarColorStyle(agent.annotationColor)}
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
  labels: ReaderUiLabels,
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

  return labels.assistantParticipationSummary(names, pendingAgents.length > 0);
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
  discussionAriaLabel,
  labels = defaultReaderUiLabels,
  onDelete,
  onOpenDiscussion,
}: {
  ariaLabel: string;
  className: string;
  deleteAriaLabel: string;
  discussionAriaLabel?: string;
  labels?: ReaderUiLabels;
  onDelete: () => void;
  onOpenDiscussion?: (sourceElement: Element) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function closeOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setOpen(false);
  }

  function openDiscussionAndClose(sourceElement: Element) {
    setOpen(false);
    onOpenDiscussion?.(sourceElement);
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
          {onOpenDiscussion ? (
            <button
              className="reader-action-menu-item"
              type="button"
              aria-label={discussionAriaLabel}
              onClick={(event) => openDiscussionAndClose(event.currentTarget)}
            >
              <MessageCircle size={13} />
              <span>{labels.enterDiscussion}</span>
            </button>
          ) : null}
          <button
            className="reader-delete-note reader-action-delete"
            type="button"
            aria-label={deleteAriaLabel}
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
          >
            <Trash2 size={13} />
            <span>{labels.deleteAnnotation}</span>
          </button>
        </div>
      ) : null}
      <ReaderConfirmDialog
        cancelLabel={labels.cancel}
        confirmLabel={labels.deleteAnnotationConfirmAction}
        description={labels.deleteAnnotationConfirmDescription}
        open={confirmOpen}
        title={labels.deleteAnnotationConfirmTitle}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete();
        }}
      />
    </div>
  );
}

function ReaderConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  open,
  title,
  onCancel,
  onConfirm,
}: {
  cancelLabel: string;
  confirmLabel: string;
  description: string;
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div className="reader-confirm-overlay" role="presentation" onMouseDown={onCancel}>
      <section
        aria-label={title}
        aria-modal="true"
        className="reader-confirm-dialog"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="reader-confirm-icon" aria-hidden="true">
            <AlertTriangle size={20} />
          </span>
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </header>
        <footer>
          <button className="reader-confirm-cancel" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="reader-confirm-delete" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </section>
    </div>
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

function elementWindowSourceRect(element: Element): ReaderWindowSourceRect {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}
