import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageCircle,
  MessageSquarePlus,
  Trash2,
} from 'lucide-react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import { annotationPersona as annotationAuthor, commentPersona } from '@yomitomo/core';
import { AvatarBadge } from './reader-component-primitives';
import { AnnotationCommentComposer } from './reader-annotation-comment-composer';
import { formatTime } from './reader-date-utils';
import { noteStyle } from './reader-style-utils';
import type { AnnotationRailSide } from './reader-utils';

const DELETE_HOLD_MS = 1600;

export function AnnotationCard({
  active,
  agents,
  annotation,
  exiting = false,
  isStackFront = true,
  messageSendShortcut,
  noteRef,
  primaryCommentExpanded,
  railSide = 'right',
  shortcutModifier,
  stackCount = 1,
  stackIndex = 0,
  commentsCloseKey,
  style,
  userProfile,
  onAddComment,
  onDelete,
  onDeleteComment = () => undefined,
  onFocus,
  onPrimaryCommentExpandedChange,
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
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
}) {
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [expandedThreadIds, setExpandedThreadIds] = useState<Set<string>>(() => new Set());
  const [replyToCommentId, setReplyToCommentId] = useState<string | null>(null);
  const [newThoughtOpen, setNewThoughtOpen] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const previousThreadRootIdsRef = useRef<string[] | null>(null);
  const suggestedMentionAgents = annotationMentionAgents(annotation, agents);
  const author = annotationAuthor(annotation, userProfile, agents);
  const discussionThreads = useMemo(() => annotationDiscussionThreads(annotation), [annotation]);
  const thoughtAuthors = useMemo(
    () => uniqueThoughtAuthors(discussionThreads, userProfile, agents),
    [agents, discussionThreads, userProfile],
  );
  const threadRootIds = useMemo(
    () => discussionThreads.map((thread) => thread.root.id),
    [discussionThreads],
  );
  const threadRootIdKey = threadRootIds.join('\u0000');
  const annotationStyle = {
    ...noteStyle(author.color, active),
    '--reader-note-accent': author.color || annotation.color,
    ...style,
  } as React.CSSProperties;

  useEffect(() => {
    setReplyToCommentId(null);
    setNewThoughtOpen(false);
    setExpandedThreadIds(new Set());
    setExpandedCommentIds(new Set());
    previousThreadRootIdsRef.current = null;
  }, [commentsCloseKey]);

  useEffect(() => {
    if (active) return;
    setReplyToCommentId(null);
    setNewThoughtOpen(false);
    setExpandedThreadIds(new Set());
  }, [active]);

  useEffect(() => {
    const previousIds = previousThreadRootIdsRef.current;
    if (previousIds === null) {
      previousThreadRootIdsRef.current = threadRootIds;
      return;
    }

    const previousIdSet = new Set(previousIds);
    const addedIds = threadRootIds.filter((id) => !previousIdSet.has(id));
    previousThreadRootIdsRef.current = threadRootIds;
    if (addedIds.length === 0) return;

    const addedId = addedIds.at(-1);
    if (!addedId) return;
    onPrimaryCommentExpandedChange(annotation.id, true);
    setExpandedThreadIds((current) => {
      const next = new Set(current);
      next.add(addedId);
      return next;
    });
  }, [annotation.id, onPrimaryCommentExpandedChange, threadRootIdKey, threadRootIds]);

  const setNoteElement = useCallback(
    (element: HTMLElement | null) => {
      sectionRef.current = element;
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

  function setCommentExpanded(commentId: string, nextExpanded: boolean) {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (nextExpanded) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  }

  function setThreadExpanded(commentId: string, nextExpanded: boolean) {
    if (nextExpanded && !active) onFocus(annotation.id);
    if (nextExpanded && !primaryCommentExpanded) {
      onPrimaryCommentExpandedChange(annotation.id, true);
    }
    setExpandedThreadIds((current) => {
      const next = new Set(current);
      if (nextExpanded) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
    if (!nextExpanded && replyToCommentId === commentId) setReplyToCommentId(null);
  }

  function setCardExpanded(nextExpanded: boolean) {
    if (nextExpanded && !active) onFocus(annotation.id);
    onPrimaryCommentExpandedChange(annotation.id, nextExpanded);
    if (!nextExpanded) {
      setReplyToCommentId(null);
      setNewThoughtOpen(false);
    }
  }

  function openReplyComposer(commentId: string) {
    if (!active) onFocus(annotation.id);
    setThreadExpanded(commentId, true);
    setReplyToCommentId(commentId);
  }

  function addTopLevelComment(content: string) {
    onAddComment(annotation.id, content);
    setNewThoughtOpen(false);
  }

  function addReply(content: string, replyTo: string) {
    onAddComment(annotation.id, content, replyTo);
    setReplyToCommentId(null);
  }

  function openNewThoughtComposer() {
    if (!active) onFocus(annotation.id);
    if (!primaryCommentExpanded) onPrimaryCommentExpandedChange(annotation.id, true);
    setNewThoughtOpen(true);
  }

  function deleteComment(commentId: string) {
    setExpandedThreadIds((current) => {
      if (!current.has(commentId)) return current;
      const next = new Set(current);
      next.delete(commentId);
      return next;
    });
    if (replyToCommentId === commentId) setReplyToCommentId(null);
    onDeleteComment(annotation.id, commentId);
  }

  return (
    <section
      className={[
        'reader-note',
        active ? 'is-active' : '',
        primaryCommentExpanded ? 'is-expanded' : '',
        exiting ? 'is-filtering-out' : '',
        stackCount > 1 ? 'is-stacked' : '',
        isStackFront ? 'is-stack-front' : '',
      ]
        .filter(Boolean)
        .join(' ')}
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
          </span>
          <span className="reader-note-time-actions">
            <time dateTime={annotation.createdAt}>{formatTime(annotation.createdAt)}</time>
            <HoldDeleteButton
              ariaLabel="长按删除批注"
              className="reader-delete-note reader-delete-annotation"
              onDelete={() => onDelete(annotation.id)}
            />
          </span>
        </div>
        <footer className="reader-note-toolbar">
          <button
            className="reader-note-thread-toggle"
            type="button"
            aria-expanded={primaryCommentExpanded}
            aria-label={primaryCommentExpanded ? '收起想法列表' : '展开想法列表'}
            onClick={() => setCardExpanded(!primaryCommentExpanded)}
          >
            <span className="reader-note-thread-toggle-main">
              <span className="reader-comment-count">
                <Lightbulb size={14} />
                {discussionThreads.length} 条想法
              </span>
              <ThoughtAuthorStack authors={thoughtAuthors} />
            </span>
            <span className="reader-note-thread-toggle-side">
              {primaryCommentExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          </button>
        </footer>
      </div>
      {primaryCommentExpanded ? (
        <div className="reader-note-comments-region">
          <div className="reader-note-comments-panel">
            {discussionThreads.length > 0 ? (
              <div className="reader-comments">
                {discussionThreads.map((thread) => (
                  <DiscussionThreadView
                    agents={agents}
                    expanded={expandedThreadIds.has(thread.root.id)}
                    expandedCommentIds={expandedCommentIds}
                    key={thread.root.id}
                    messageSendShortcut={messageSendShortcut}
                    replyOpen={replyToCommentId === thread.root.id}
                    shortcutModifier={shortcutModifier}
                    suggestedMentionAgents={suggestedMentionAgents}
                    thread={thread}
                    userProfile={userProfile}
                    onAddReply={addReply}
                    onCloseReply={() => setReplyToCommentId(null)}
                    onCommentExpandedChange={setCommentExpanded}
                    onDelete={() => deleteComment(thread.root.id)}
                    onOpenReply={() => openReplyComposer(thread.root.id)}
                    onThreadExpandedChange={(nextExpanded) =>
                      setThreadExpanded(thread.root.id, nextExpanded)
                    }
                  />
                ))}
              </div>
            ) : null}
            <div
              className={[
                'reader-new-thought-composer',
                discussionThreads.length === 0 ? 'is-empty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <InlineCommentComposer
                agents={agents}
                open={newThoughtOpen}
                messageSendShortcut={messageSendShortcut}
                placeholder="添加新的想法，或 @助手一起看这段"
                shortcutModifier={shortcutModifier}
                submitLabel="记录"
                suggestedAgents={suggestedMentionAgents}
                triggerIcon={<MessageSquarePlus size={14} />}
                triggerLabel="添加想法"
                onClose={() => setNewThoughtOpen(false)}
                onOpen={openNewThoughtComposer}
                onSubmit={addTopLevelComment}
              />
            </div>
          </div>
        </div>
      ) : null}
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

function commentAuthorKey(comment: Annotation['comments'][number], username: string) {
  return comment.author === 'ai'
    ? `ai:${comment.agentId || comment.agentUsername || username}`
    : `user:${comment.userId || comment.userUsername || username}`;
}

function avatarColorStyle(color: string): React.CSSProperties {
  return { '--reader-avatar-color': color } as React.CSSProperties;
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
      style={{ '--delete-hold-ms': `${DELETE_HOLD_MS}ms` } as React.CSSProperties}
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

function DiscussionThreadView({
  agents,
  expanded,
  expandedCommentIds,
  messageSendShortcut,
  replyOpen,
  shortcutModifier,
  suggestedMentionAgents,
  thread,
  userProfile,
  onAddReply,
  onCloseReply,
  onCommentExpandedChange,
  onDelete,
  onOpenReply,
  onThreadExpandedChange,
}: {
  agents: PublicAgent[];
  expanded: boolean;
  expandedCommentIds: Set<string>;
  messageSendShortcut: MessageSendShortcut;
  replyOpen: boolean;
  shortcutModifier: string;
  suggestedMentionAgents: PublicAgent[];
  thread: DiscussionThread;
  userProfile: UserProfile;
  onAddReply: (content: string, replyTo: string) => void;
  onCloseReply: () => void;
  onCommentExpandedChange: (commentId: string, expanded: boolean) => void;
  onDelete: () => void;
  onOpenReply: () => void;
  onThreadExpandedChange: (expanded: boolean) => void;
}) {
  const author = commentPersona(thread.root, userProfile, agents);
  const replyCount = thread.replies.length;

  return (
    <section
      className={[
        'reader-discussion-thread',
        expanded ? 'is-open' : '',
        replyCount > 0 ? 'has-replies' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="reader-thought-summary-wrap">
        <div className="reader-thought-summary">
          <span
            className="reader-thought-owner"
            style={avatarColorStyle(author.color)}
            aria-hidden="true"
          >
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
          </span>
          <div className="reader-thought-summary-copy">
            <div className="reader-thought-summary-meta">
              <strong>{author.nickname}</strong>
              <time className="reader-thought-time" dateTime={thread.root.createdAt}>
                {formatTime(thread.root.createdAt)}
              </time>
            </div>
            <CollapsibleMarkdownContent
              content={thread.root.content}
              expanded={expandedCommentIds.has(thread.root.id)}
              pending={thread.root.pending}
              onExpandedChange={(nextExpanded) =>
                onCommentExpandedChange(thread.root.id, nextExpanded)
              }
            />
          </div>
        </div>
        <HoldDeleteButton
          ariaLabel="长按删除想法"
          className="reader-delete-note reader-delete-thought"
          iconSize={12}
          onDelete={onDelete}
        />
      </div>
      <footer className="reader-thought-footer">
        {replyCount > 0 ? (
          <button
            className="reader-replies-toggle"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? '收起回复列表' : '展开回复列表'}
            onClick={() => onThreadExpandedChange(!expanded)}
          >
            <MessageCircle size={13} />
            <span>{replyCount} 条回复</span>
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        ) : (
          <span className="reader-replies-label">
            <MessageCircle size={13} />
            <span>0 条回复</span>
          </span>
        )}
        <div className="reader-thread-reply-composer">
          <InlineCommentComposer
            agents={agents}
            open={replyOpen}
            messageSendShortcut={messageSendShortcut}
            placeholder="回复这条想法，或 @助手继续讨论"
            shortcutModifier={shortcutModifier}
            submitLabel="回复"
            suggestedAgents={suggestedMentionAgents}
            triggerIcon={<MessageCircle size={13} />}
            triggerLabel="回复"
            onClose={onCloseReply}
            onOpen={onOpenReply}
            onSubmit={(content) => onAddReply(content, thread.root.id)}
          />
        </div>
      </footer>
      {expanded ? (
        <div className="reader-thread-detail">
          {replyCount > 0 ? (
            <div className="reader-thread-replies">
              {thread.replies.map((comment) => (
                <ThreadComment
                  agents={agents}
                  comment={comment}
                  expanded={expandedCommentIds.has(comment.id)}
                  key={comment.id}
                  nested
                  userProfile={userProfile}
                  onExpandedChange={(nextExpanded) =>
                    onCommentExpandedChange(comment.id, nextExpanded)
                  }
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
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

function ThreadComment({
  agents,
  comment,
  expanded,
  nested,
  userProfile,
  onExpandedChange,
}: {
  agents: PublicAgent[];
  comment: Annotation['comments'][number];
  expanded: boolean;
  nested: boolean;
  userProfile: UserProfile;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const author = commentPersona(comment, userProfile, agents);

  return (
    <div className={nested ? 'reader-comment is-reply' : 'reader-comment is-root'}>
      <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
      <div className="reader-comment-body">
        <div className="reader-comment-author">
          <strong>{author.nickname}</strong>
          <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
        </div>
        <CollapsibleMarkdownContent
          content={comment.content}
          expanded={expanded}
          pending={comment.pending}
          onExpandedChange={onExpandedChange}
        />
      </div>
    </div>
  );
}

function InlineCommentComposer({
  agents,
  messageSendShortcut,
  open,
  placeholder,
  shortcutModifier,
  submitLabel,
  suggestedAgents,
  triggerIcon,
  triggerLabel,
  onClose,
  onOpen,
  onSubmit,
}: {
  agents: PublicAgent[];
  messageSendShortcut: MessageSendShortcut;
  open: boolean;
  placeholder: string;
  shortcutModifier: string;
  submitLabel: string;
  suggestedAgents: PublicAgent[];
  triggerIcon: React.ReactNode;
  triggerLabel: string;
  onClose: () => void;
  onOpen: () => void;
  onSubmit: (content: string) => void;
}) {
  const [focusRequestKey, setFocusRequestKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setFocusRequestKey((key) => key + 1);
  }, [open]);

  function handleBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    onClose();
  }

  function submit(content: string) {
    onSubmit(content);
    onClose();
  }

  if (!open) {
    return (
      <button className="reader-inline-composer-trigger" type="button" onClick={onOpen}>
        {triggerIcon}
        <span>{triggerLabel}</span>
      </button>
    );
  }

  return (
    <div
      className="reader-inline-composer-panel t-dropdown is-open"
      data-origin="top-left"
      onBlur={handleBlur}
    >
      <AnnotationCommentComposer
        agents={agents}
        focusRequestKey={focusRequestKey}
        messageSendShortcut={messageSendShortcut}
        placeholder={placeholder}
        shortcutModifier={shortcutModifier}
        submitLabel={submitLabel}
        suggestedAgents={suggestedAgents}
        onSubmit={submit}
      />
    </div>
  );
}

function CollapsibleMarkdownContent({
  content,
  expanded,
  pending,
  onExpandedChange,
}: {
  content: string;
  expanded: boolean;
  pending?: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [collapsible, setCollapsible] = useState(false);
  const html = useMemo(() => renderMarkdown(content), [content]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const target = element;

    function measure() {
      const styles = window.getComputedStyle(target);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 21;
      setCollapsible(target.scrollHeight > lineHeight * 4 + 1);
    }

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    return () => observer.disconnect();
  }, [content, expanded]);

  return (
    <div
      className={[
        'reader-markdown',
        'reader-comment-markdown',
        collapsible && !expanded ? 'is-collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="reader-markdown-content"
        ref={contentRef}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {pending ? <i className="reader-spinner" /> : null}
      {collapsible ? (
        <button
          className="reader-comment-expand"
          type="button"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? '收起' : '展开'}
        </button>
      ) : null}
    </div>
  );
}

function annotationMentionAgents(annotation: Annotation, agents: PublicAgent[]) {
  const authorAgent =
    annotation.author === 'ai' && annotation.agentUsername
      ? agents.find(
          (agent) => agent.id === annotation.agentId || agent.username === annotation.agentUsername,
        ) || {
          id: annotation.agentId || `agent-${annotation.agentUsername}`,
          kind: 'annotation' as const,
          enabled: true,
          nickname: annotation.agentNickname || annotation.agentUsername,
          username: annotation.agentUsername,
          avatar: annotation.agentAvatar || annotation.agentUsername.slice(0, 1),
          annotationColor: annotation.agentAnnotationColor || annotation.color,
          annotationDensity: 'medium' as const,
          personalityName: '批注助手',
          temperature: 0.35,
        }
      : null;
  const ordered = authorAgent
    ? [authorAgent, ...agents.filter((agent) => agent.username !== authorAgent.username)]
    : agents;
  return ordered;
}
