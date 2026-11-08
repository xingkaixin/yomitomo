import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert01Icon,
  BulbIcon,
  Delete02Icon,
  Layers02Icon,
  BubbleChatIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import React, { useMemo, useReducer, useRef } from 'react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { annotationCommentThreads, commentPersona } from '@yomitomo/core';
import { AvatarBadge, ReaderTooltip } from '../shared/reader-component-primitives';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import type { AnnotationRailSide } from './annotation-rail-layout';
import type { ReaderWindowSourceRect } from './reader-annotation-types';
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

type AnnotationCardLabels = Pick<
  ReaderUiLabels,
  | 'annotationCardTab'
  | 'annotationProcessing'
  | 'assistantParticipationSummary'
  | 'cancel'
  | 'dateLocale'
  | 'deleteAnnotation'
  | 'deleteAnnotationConfirmAction'
  | 'deleteAnnotationConfirmDescription'
  | 'deleteAnnotationConfirmTitle'
  | 'deleteHighlight'
  | 'distillations'
  | 'enterDiscussion'
  | 'openDistillationActions'
  | 'openHighlightActions'
  | 'relativeTimeLabel'
  | 'thoughtSummary'
>;

type PendingAgentStackLabels = Pick<ReaderUiLabels, 'annotationProcessing'>;
type AssistantParticipationLabels = Pick<ReaderUiLabels, 'assistantParticipationSummary'>;
type DeleteActionMenuLabels = Pick<
  ReaderUiLabels,
  | 'cancel'
  | 'deleteAnnotation'
  | 'deleteAnnotationConfirmAction'
  | 'deleteAnnotationConfirmDescription'
  | 'deleteAnnotationConfirmTitle'
  | 'enterDiscussion'
>;

export type { ReaderWindowSourceRect } from './reader-annotation-types';

type AnnotationCardProps = {
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
  labels?: AnnotationCardLabels;
  noteRef: (element: HTMLElement | null) => void;
  ordinal?: number;
  railSide?: AnnotationRailSide;
  personaAgents?: PublicAgent[];
  stackCount?: number;
  stackIndex?: number;
  style?: React.CSSProperties;
  userProfile: UserProfile;
  onDelete: (annotationId: string) => void;
  onFocus: (annotationId: string) => void;
  onOpenDiscussion?: (annotationId: string, sourceRect?: ReaderWindowSourceRect) => void;
  pendingAgents?: PublicAgent[];
  timeFormatter?: Intl.DateTimeFormat;
};

const emptyAgents: PublicAgent[] = [];

// The flip hides the note's own border and shadow, so fading them back in would blink once the faces unmount.
function settleFlippedNote(note: HTMLElement) {
  queueMicrotask(() => {
    if (note.classList.contains('is-distillation-dual-morph')) return;
    for (const animation of note.getAnimations?.() ?? []) {
      const property = (animation as CSSTransition).transitionProperty;
      if (property === 'box-shadow' || property?.startsWith('border-')) animation.finish();
    }
  });
}

type DualMorphMeasurement = { height: number; token: number };

function dualMorphReducer(current: DualMorphMeasurement | null, next: DualMorphMeasurement) {
  return current?.token === next.token && current.height === next.height ? current : next;
}

export const AnnotationCard = React.memo(function AnnotationCard({
  noteRef,
  style,
  exiting = false,
  isStackFront = true,
  railSide = 'right',
  stackCount = 1,
  stackIndex = 0,
  timeFormatter,
  distillationAnimation,
  ...props
}: AnnotationCardProps) {
  const { annotation, active, onFocus, labels = defaultReaderUiLabels } = props;
  const isDualMorph =
    distillationAnimation?.phase !== 'update' &&
    (distillationAnimation?.transition === 'publish' ||
      distillationAnimation?.transition === 'unpublish') &&
    Boolean(distillationAnimation.overlayDistillation);
  const overlay = isDualMorph ? distillationAnimation?.overlayDistillation : undefined;
  const distillationTime =
    overlay?.updatedAt ||
    overlay?.publishedAt ||
    annotation.distillation?.updatedAt ||
    annotation.distillation?.publishedAt ||
    annotation.updatedAt;
  const [dualMorph, measureDualMorph] = useReducer(dualMorphReducer, null);

  const noteClassName = [
    'reader-note',
    active ? 'is-active' : '',
    annotation.distillation?.status === 'published' ? 'has-distillation' : 'has-discussion',
    isDualMorph ? 'is-distillation-dual-morph' : '',
    isDualMorph && annotation.distillation?.status === 'published' ? 'is-dual-show-dist' : '',
    isDualMorph && annotation.distillation?.status !== 'published' ? 'is-dual-show-anno' : '',
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
  const dualMorphDistillationContent =
    distillationAnimation?.overlayDistillation?.content.trim() || distillationContent;
  const dualMorphAnnotationRef = useRef<HTMLDivElement | null>(null);
  const dualMorphDistillationRef = useRef<HTMLDivElement | null>(null);
  const dualMorphToken = isDualMorph ? distillationAnimation?.token : undefined;
  const dualMorphHeight =
    dualMorphToken !== undefined && dualMorph?.token === dualMorphToken ? dualMorph.height : null;

  // Not memoized: either face can change height on any render, so the stage re-measures after every commit.
  function measureDualMorphStage(stage: HTMLDivElement | null) {
    if (!stage || dualMorphToken === undefined) return;
    const targetElement =
      annotation.distillation?.status === 'published'
        ? dualMorphDistillationRef.current
        : dualMorphAnnotationRef.current;
    if (!targetElement) return;
    measureDualMorph({ height: targetElement.offsetHeight, token: dualMorphToken });
    const note = stage.parentElement;
    return note ? () => settleFlippedNote(note) : undefined;
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (active) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button,textarea,input,a,[role="button"]')) return;
    onFocus(annotation.id);
  }

  function renderContent(face: 'annotation' | 'distillation', text: string) {
    const timestamp = face === 'annotation' ? annotation.createdAt : distillationTime;
    return (
      <AnnotationCardContent
        {...props}
        face={face}
        displayedText={text}
        timestamp={timestamp}
        timeLabel={formatRelativeTime(timestamp, labels)}
        fullTime={formatTime(timestamp, labels, timeFormatter)}
      />
    );
  }

  return (
    <section
      className={noteClassName}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      data-annotation-id={annotation.id}
      data-rail-side={railSide}
      data-distillation-animation={distillationAnimation?.token}
      data-distillation-transition={distillationAnimation?.transition}
      ref={noteRef}
      style={style}
      onClick={handleCardClick}
    >
      {isDualMorph ? (
        <div
          className="reader-note-dual-morph-stage"
          ref={measureDualMorphStage}
          style={dualMorphHeight === null ? undefined : { height: `${dualMorphHeight}px` }}
        >
          <div className="reader-note-dual-flipper">
            <div
              className="reader-note-dual-face reader-note-dual-face-annotation"
              ref={dualMorphAnnotationRef}
            >
              {renderContent('annotation', annotation.anchor.exact)}
            </div>
            <div
              className="reader-note-dual-face reader-note-dual-face-distillation"
              ref={dualMorphDistillationRef}
            >
              {renderContent('distillation', dualMorphDistillationContent)}
            </div>
          </div>
        </div>
      ) : (
        renderContent(displaysDistillation ? 'distillation' : 'annotation', displayedText)
      )}
    </section>
  );
});

type AnnotationCardContentProps = Omit<
  AnnotationCardProps,
  | 'noteRef'
  | 'style'
  | 'exiting'
  | 'isStackFront'
  | 'railSide'
  | 'stackCount'
  | 'stackIndex'
  | 'timeFormatter'
  | 'distillationAnimation'
> & {
  face: 'annotation' | 'distillation';
  displayedText: string;
  timestamp: string;
  timeLabel: string;
  fullTime: string;
};

const AnnotationCardContent = React.memo(function AnnotationCardContent({
  active,
  agents,
  annotation,
  labels = defaultReaderUiLabels,
  personaAgents: extraPersonaAgents = emptyAgents,
  userProfile,
  onDelete,
  onFocus,
  onOpenDiscussion,
  ordinal,
  pendingAgents = emptyAgents,
  face,
  displayedText,
  timestamp,
  timeLabel,
  fullTime,
}: AnnotationCardContentProps) {
  const personaAgents = useMemo(
    () => [...agents, ...extraPersonaAgents],
    [agents, extraPersonaAgents],
  );
  const discussionThreads = useMemo(() => annotationDiscussionThreads(annotation), [annotation]);
  const thoughts = discussionThreads.filter((thread) => thread.root.content.trim());
  const firstThought = (
    thoughts.find((thread) => thread.root.author.kind === 'user') ?? thoughts[0]
  )?.root.content;
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
  function openDiscussion(sourceElement: Element) {
    if (!active) onFocus(annotation.id);
    onOpenDiscussion?.(annotation.id, elementWindowSourceRect(sourceElement));
  }

  function renderAnnotationSurface() {
    return (
      <>
        <span className="reader-note-tab">{ordinal ?? labels.annotationCardTab}</span>
        <div className="reader-note-body">
          <header className="reader-note-meta">
            {ordinal === undefined ? null : <span className="reader-note-num">{ordinal}</span>}
            <span className="reader-note-meta-copy">
              <ReaderRelativeTime fullTime={fullTime} value={timestamp} text={timeLabel} />
            </span>
          </header>
          {firstThought ? (
            <p className="reader-note-text">{firstThought}</p>
          ) : (
            <p className="reader-note-text reader-note-highlight-text">{annotation.anchor.exact}</p>
          )}
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
                  <HugeiconsIcon icon={BulbIcon} size={14} />
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
              <HugeiconsIcon icon={BubbleChatIcon} size={14} />
              <span>{labels.enterDiscussion}</span>
            </button>
          </footer>
        </div>
      </>
    );
  }

  function renderDistillationSurface(content: string) {
    return (
      <>
        <span className="reader-note-tab">
          <HugeiconsIcon icon={Layers02Icon} size={13} strokeWidth={2} />
          <span>{ordinal ?? labels.distillations}</span>
        </span>
        <div className="reader-note-body">
          <header className="reader-note-meta">
            {ordinal === undefined ? null : <span className="reader-note-num">{ordinal}</span>}
            <span className="reader-note-distillation-tag">
              <HugeiconsIcon icon={Layers02Icon} size={11} strokeWidth={2} />
              {labels.distillations}
            </span>
          </header>
          <p className="reader-note-text">{content}</p>
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
        {timestamp ? (
          <footer className="reader-note-toolbar reader-note-distillation-footer">
            <ReaderRelativeTime
              className="reader-note-distillation-time"
              fullTime={fullTime}
              value={timestamp}
              text={timeLabel}
            />
          </footer>
        ) : null}
      </>
    );
  }

  return face === 'distillation'
    ? renderDistillationSurface(displayedText)
    : renderAnnotationSurface();
});

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
  labels?: PendingAgentStackLabels;
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
    if (comment.author.kind !== 'agent') continue;
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
  labels: AssistantParticipationLabels,
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
  return comment.author.kind === 'agent'
    ? `ai:${comment.author.agentId}`
    : `user:${comment.author.userId || username}`;
}

function avatarColorStyle(color: string): React.CSSProperties {
  const style: AvatarColorStyle = { '--reader-avatar-color': color };
  return style;
}

function ReaderRelativeTime({
  className,
  fullTime,
  value,
  text,
}: {
  className?: string;
  fullTime: string;
  value: string;
  text: string;
}) {
  return (
    <ReaderTooltip content={fullTime}>
      <time className={className} dateTime={value} tabIndex={0}>
        {text}
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
  labels?: DeleteActionMenuLabels;
  onDelete: () => void;
  onOpenDiscussion?: (sourceElement: Element) => void;
}) {
  const [{ confirmOpen, open }, dispatch] = useReducer(deleteActionMenuReducer, {
    confirmOpen: false,
    open: false,
  });

  function openDiscussionAndClose(sourceElement: Element) {
    dispatch({ type: 'menuOpenChanged', open: false });
    onOpenDiscussion?.(sourceElement);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => dispatch({ type: 'menuOpenChanged', open: nextOpen })}
    >
      <div
        className={[className, 'reader-action-menu', open ? 'is-open' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <DropdownMenuTrigger asChild>
          <button className="reader-action-menu-button" type="button" aria-label={ariaLabel}>
            <HugeiconsIcon icon={MoreHorizontalIcon} size={16} />
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
                <HugeiconsIcon icon={BubbleChatIcon} size={13} />
                <span>{labels.enterDiscussion}</span>
              </button>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <button
              className="reader-delete-note reader-action-delete"
              type="button"
              aria-label={deleteAriaLabel}
              onClick={() => dispatch({ type: 'deleteRequested' })}
            >
              <HugeiconsIcon icon={Delete02Icon} size={13} />
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
          onCancel={() => dispatch({ type: 'deleteDismissed' })}
          onConfirm={() => {
            dispatch({ type: 'deleteDismissed' });
            onDelete();
          }}
        />
      </div>
    </DropdownMenu>
  );
}

type DeleteActionMenuState = { confirmOpen: boolean; open: boolean };

type DeleteActionMenuEvent =
  | { type: 'deleteDismissed' }
  | { type: 'deleteRequested' }
  | { type: 'menuOpenChanged'; open: boolean };

function deleteActionMenuReducer(
  state: DeleteActionMenuState,
  event: DeleteActionMenuEvent,
): DeleteActionMenuState {
  switch (event.type) {
    case 'deleteDismissed':
      return { ...state, confirmOpen: false };
    case 'deleteRequested':
      return { confirmOpen: true, open: false };
    case 'menuOpenChanged':
      return { ...state, open: event.open };
  }
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
              <HugeiconsIcon icon={Alert01Icon} size={20} />
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
  return annotationCommentThreads(annotation.comments)
    .map(({ root, replies }) => ({
      root,
      replies: replies.toSorted(compareCommentsOldestFirst),
    }))
    .toSorted((left, right) => compareCommentsOldestFirst(left.root, right.root));
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
