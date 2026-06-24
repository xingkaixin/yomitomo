import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Layers2,
  Lightbulb,
  MessageCircle,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationPersona as annotationAuthor, commentPersona } from '@yomitomo/core';
import { AvatarBadge, ReaderTooltip } from '../shared/reader-component-primitives';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import type { AnnotationRailSide } from './reader-annotations';
import type { ReaderUiLabels } from '../shell/reader-app-view-types';
import { defaultReaderUiLabels } from '../shell/reader-app-view-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';

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
    phase: 'morph-out' | 'morph-in' | 'update';
    overlayDistillation?: {
      content: string;
      publishedAt?: string;
      updatedAt?: string;
    };
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
  const isDualMorph =
    distillationAnimation?.phase !== 'update' &&
    (distillationAnimation?.transition === 'publish' ||
      distillationAnimation?.transition === 'unpublish') &&
    Boolean(distillationAnimation.overlayDistillation);
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
    isDualMorph ? 'is-distillation-dual-morph' : '',
    isDualMorph && annotation.distillation?.status === 'published' ? 'is-dual-show-dist' : '',
    isDualMorph && annotation.distillation?.status !== 'published' ? 'is-dual-show-anno' : '',
    isDualMorph &&
    distillationAnimation?.transition === 'publish' &&
    annotation.distillation?.status === 'published'
      ? 'is-dual-stamp-in'
      : '',
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
  const displayedText = displaysDistillation ? distillationContent : annotation.anchor.exact;
  const distillationPublishedAt =
    annotation.distillation?.updatedAt ||
    annotation.distillation?.publishedAt ||
    annotation.updatedAt;
  const dualMorphDistillation = distillationAnimation?.overlayDistillation;
  const dualMorphDistillationContent = dualMorphDistillation?.content.trim() || distillationContent;
  const dualMorphDistillationTime =
    dualMorphDistillation?.updatedAt ||
    dualMorphDistillation?.publishedAt ||
    distillationPublishedAt;
  const dualMorphAnnotationRef = useRef<HTMLDivElement | null>(null);
  const dualMorphDistillationRef = useRef<HTMLDivElement | null>(null);
  const [dualMorphHeight, setDualMorphHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!isDualMorph) {
      setDualMorphHeight(null);
      return;
    }

    const targetElement =
      annotation.distillation?.status === 'published'
        ? dualMorphDistillationRef.current
        : dualMorphAnnotationRef.current;
    const nextHeight = targetElement?.offsetHeight ?? null;
    if (nextHeight === null) return;
    setDualMorphHeight((current) => (current === nextHeight ? current : nextHeight));
  });

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

  function renderAnnotationSurface() {
    return (
      <>
        <span className="reader-note-tab">{labels.annotationCardTab}</span>
        <div className="reader-note-body">
          <header className="reader-note-card-header">
            <button
              className="reader-note-quote"
              type="button"
              onClick={() => onFocus(annotation.id)}
            >
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
              <ReaderRelativeTime labels={labels} value={annotation.createdAt} />
            </span>
          </div>
          <DeleteActionMenu
            ariaLabel={labels.openHighlightActions}
            className="reader-note-action-menu"
            deleteAriaLabel={labels.deleteHighlight}
            labels={labels}
            onDelete={() => onDelete(annotation.id)}
          />
          <footer className={toolbarClassName}>
            <div
              className={summaryClassName}
              id={thoughtSummaryId}
              aria-label={discussionSummaryLabel}
            >
              <span className="reader-note-thread-toggle-main">
                <span
                  className="reader-comment-count"
                  aria-label={labels.thoughtSummary(visibleThoughtCount, pendingAgents.length > 0)}
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
        </div>
      </>
    );
  }

  function renderDistillationSurface(content: string, time?: string) {
    return (
      <>
        <span className="reader-note-tab">
          <Layers2 size={13} strokeWidth={2} />
          <span>{labels.distillations}</span>
        </span>
        <div className="reader-note-body">
          <header className="reader-note-card-header">
            <button
              className="reader-note-quote"
              type="button"
              onClick={() => onFocus(annotation.id)}
            >
              <span className="reader-note-quote-text">{content}</span>
            </button>
          </header>
          <DeleteActionMenu
            ariaLabel={labels.openDistillationActions}
            className="reader-note-action-menu reader-note-distillation-menu"
            deleteAriaLabel={labels.deleteHighlight}
            discussionAriaLabel={labels.enterDiscussion}
            labels={labels}
            onDelete={() => onDelete(annotation.id)}
            onOpenDiscussion={openDiscussion}
          />
        </div>
        {time ? (
          <footer className="reader-note-toolbar reader-note-distillation-footer">
            <ReaderRelativeTime
              className="reader-note-distillation-time"
              labels={labels}
              value={time}
            />
          </footer>
        ) : null}
      </>
    );
  }

  const commonSectionProps = {
    className: noteClassName,
    'data-stack-count': stackCount,
    'data-stack-index': stackIndex,
    'data-annotation-id': annotation.id,
    'data-rail-side': railSide,
    'data-distillation-animation': distillationAnimation?.token,
    'data-distillation-transition': distillationAnimation?.transition,
    ref: setNoteElement,
    style,
    onClick: handleCardClick,
  };

  if (isDualMorph) {
    return (
      <section {...commonSectionProps}>
        <div
          className="reader-note-dual-morph-stage"
          style={dualMorphHeight === null ? undefined : { height: `${dualMorphHeight}px` }}
        >
          <div
            className="reader-note-dual-face reader-note-dual-face-annotation"
            ref={dualMorphAnnotationRef}
          >
            {renderAnnotationSurface()}
          </div>
          <div
            className="reader-note-dual-face reader-note-dual-face-distillation"
            ref={dualMorphDistillationRef}
          >
            {renderDistillationSurface(dualMorphDistillationContent, dualMorphDistillationTime)}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section {...commonSectionProps}>
      {displaysDistillation
        ? renderDistillationSurface(displayedText, distillationPublishedAt)
        : renderAnnotationSurface()}
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

function ReaderRelativeTime({
  className,
  labels,
  value,
}: {
  className?: string;
  labels: ReaderUiLabels;
  value: string;
}) {
  return (
    <ReaderTooltip content={formatTime(value, labels)}>
      <time className={className} dateTime={value} tabIndex={0}>
        {formatRelativeTime(value, labels)}
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

  function openDiscussionAndClose(sourceElement: Element) {
    setOpen(false);
    onOpenDiscussion?.(sourceElement);
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <div
        className={[className, 'reader-action-menu', open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <DropdownMenuTrigger asChild>
          <button className="reader-action-menu-button" type="button" aria-label={ariaLabel}>
            <MoreHorizontal size={16} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="reader-action-menu-panel" side="bottom" sideOffset={7}>
          {onOpenDiscussion ? (
            <DropdownMenuItem asChild>
              <button
                className="reader-action-menu-item"
                type="button"
                aria-label={discussionAriaLabel}
                onClick={(event) => openDiscussionAndClose(event.currentTarget)}
              >
                <MessageCircle size={13} />
                <span>{labels.enterDiscussion}</span>
              </button>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
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
          </DropdownMenuItem>
        </DropdownMenuContent>
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
    </DropdownMenu>
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
  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogPortal>
        <DialogOverlay className="reader-confirm-overlay" />
        <DialogContent className="reader-confirm-dialog">
          <header>
            <span className="reader-confirm-icon" aria-hidden="true">
              <AlertTriangle size={20} />
            </span>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
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
        </DialogContent>
      </DialogPortal>
    </Dialog>
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
