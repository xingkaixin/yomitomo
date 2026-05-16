import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare, MoreHorizontal, Trash2 } from 'lucide-react';
import type { Annotation, MessageSendShortcut, PublicAgent, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import {
  annotationPersona as annotationAuthor,
  annotationPrimaryComment,
  annotationThreadComments,
  commentPersona,
  getMentionQuery,
  questionStatusLabel,
} from '@yomitomo/core';
import {
  AnnotationTypeLabelContent,
  AvatarBadge,
  ReadingIntentLabelContent,
  SubmitShortcutKeys,
} from './reader-component-primitives';
import { formatTime } from './reader-date-utils';
import { matchesAgentMentionQuery, mentionDraftWithAgent } from './reader-mention-utils';
import { hashString, noteStyle } from './reader-style-utils';
import { isMessageSendShortcutEvent } from './reader-utils';

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
  shortcutModifier,
  stackCount = 1,
  stackIndex = 0,
  commentsCloseKey,
  replyRequestKey,
  style,
  userProfile,
  onAddComment,
  onDelete,
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
  shortcutModifier: string;
  stackCount?: number;
  stackIndex?: number;
  commentsCloseKey: number;
  replyRequestKey?: number;
  style?: React.CSSProperties;
  userProfile: UserProfile;
  onAddComment: (annotationId: string, content: string) => void;
  onDelete: (annotationId: string) => void;
  onFocus: (annotationId: string) => void;
  onPrimaryCommentExpandedChange: (annotationId: string, expanded: boolean) => void;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(() => new Set());
  const [deleteHolding, setDeleteHolding] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [agentTrayOpen, setAgentTrayOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const sectionRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const previousCommentIdsRef = useRef<string[]>([]);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const mentionAgents = annotationMentionAgents(annotation, agents);
  const visibleMentionAgents = mentionAgents.slice(0, 2);
  const overflowMentionAgents = mentionAgents.slice(2);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query)).slice(0, 5);
  const author = annotationAuthor(annotation, userProfile, agents);
  const primaryComment = useMemo(() => annotationPrimaryComment(annotation), [annotation]);
  const threadComments = useMemo(() => annotationThreadComments(annotation), [annotation]);
  const threadCommentIds = useMemo(
    () => threadComments.map((comment) => comment.id),
    [threadComments],
  );
  const threadCommentIdKey = threadCommentIds.join('\u0000');
  const annotationStyle = {
    ...noteStyle(author.color, active),
    ...style,
  };
  const commentsPanelId = useMemo(
    () => `reader-comments-${hashString(annotation.id).toString(36)}`,
    [annotation.id],
  );

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    if (!active && expanded) {
      setExpanded(false);
      setExpandedCommentIds(new Set());
    }
  }, [active, expanded]);

  useEffect(() => {
    setExpanded(false);
    setExpandedCommentIds(new Set());
    setAgentTrayOpen(false);
  }, [commentsCloseKey]);

  useEffect(() => {
    if (replyRequestKey === undefined) return;
    previousCommentIdsRef.current = threadCommentIds;
    setExpandedCommentIds(new Set());
    setExpanded(true);
    setAgentTrayOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [replyRequestKey]);

  useLayoutEffect(() => {
    if (!expanded) {
      previousCommentIdsRef.current = threadCommentIds;
      return;
    }

    const previousIds = new Set(previousCommentIdsRef.current);
    const addedIds = threadCommentIds.filter((commentId) => !previousIds.has(commentId));
    if (addedIds.length > 0) {
      setExpandedCommentIds((current) => {
        const next = new Set(current);
        for (const commentId of addedIds) next.add(commentId);
        return next;
      });
    }
    previousCommentIdsRef.current = threadCommentIds;
  }, [expanded, threadCommentIdKey]);

  useEffect(() => () => stopDeleteTimer(), []);

  const setNoteElement = useCallback(
    (element: HTMLElement | null) => {
      sectionRef.current = element;
      noteRef(element);
    },
    [noteRef],
  );

  function submit() {
    onAddComment(annotation.id, draft);
    setDraft('');
    setCaretIndex(0);
  }

  function stopDeleteTimer() {
    if (deleteTimerRef.current !== null) window.clearTimeout(deleteTimerRef.current);
    deleteTimerRef.current = null;
  }

  function clearDeleteHold() {
    stopDeleteTimer();
    setDeleteHolding(false);
  }

  function startDeleteHold(event: React.PointerEvent<HTMLButtonElement>) {
    if (deleteTimerRef.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDeleteHolding(true);
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      onDelete(annotation.id);
    }, DELETE_HOLD_MS);
  }

  function selectAgent(agent: PublicAgent) {
    insertAgent(agent);
  }

  function insertAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(draft, agent.username, mentionQuery);
    setDraft(next.content);
    setCaretIndex(next.caretIndex);
    setAgentTrayOpen(false);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function updateCaret(element: HTMLTextAreaElement) {
    setCaretIndex(element.selectionStart);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      setSelectedMentionIndex((index) => (index - 1 + matchedAgents.length) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      selectAgent(matchedAgents[selectedMentionIndex] || matchedAgents[0]);
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      submit();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  function handleCardClick(event: React.MouseEvent<HTMLElement>) {
    if (active) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button,textarea,input,a,[role="button"]')) return;
    onFocus(annotation.id);
  }

  function toggleComments() {
    if (expanded) {
      setExpanded(false);
      setExpandedCommentIds(new Set());
      setAgentTrayOpen(false);
      return;
    }

    if (!active) onFocus(annotation.id);
    previousCommentIdsRef.current = threadCommentIds;
    setExpandedCommentIds(new Set());
    setExpanded(true);
    setAgentTrayOpen(false);
  }

  function setCommentExpanded(commentId: string, nextExpanded: boolean) {
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (nextExpanded) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  }

  function closeAgentTrayOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setAgentTrayOpen(false);
  }

  return (
    <section
      className={[
        'reader-note',
        active ? 'is-active' : '',
        exiting ? 'is-filtering-out' : '',
        stackCount > 1 ? 'is-stacked' : '',
        isStackFront ? 'is-stack-front' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-stack-count={stackCount}
      data-stack-index={stackIndex}
      data-annotation-id={annotation.id}
      ref={setNoteElement}
      style={annotationStyle}
      onClick={handleCardClick}
    >
      <div className="reader-note-body">
        <div className="reader-note-action-row">
          {annotation.annotationType ? (
            <span className="reader-note-type">
              <AnnotationTypeLabelContent type={annotation.annotationType} />
            </span>
          ) : null}
          {annotation.readingIntent ? (
            <span className="reader-note-intent">
              <ReadingIntentLabelContent intent={annotation.readingIntent} />
            </span>
          ) : null}
          <time dateTime={annotation.createdAt}>{formatTime(annotation.createdAt)}</time>
        </div>
        <button className="reader-note-anchor" type="button" onClick={() => onFocus(annotation.id)}>
          <span className="reader-note-persona">
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
            <strong>{author.nickname}</strong>
            <em>@{author.username}</em>
          </span>
        </button>
        <button className="reader-note-quote" type="button" onClick={() => onFocus(annotation.id)}>
          “{annotation.anchor.exact}”
        </button>
        {primaryComment ? (
          <div className="reader-note-primary-comment">
            <CollapsibleMarkdownContent
              content={primaryComment.content}
              expanded={primaryCommentExpanded}
              pending={primaryComment.pending}
              onExpandedChange={(nextExpanded) =>
                onPrimaryCommentExpandedChange(annotation.id, nextExpanded)
              }
            />
          </div>
        ) : null}
        <div className="reader-note-toolbar">
          <button
            className="reader-comment-toggle"
            type="button"
            aria-controls={commentsPanelId}
            aria-expanded={expanded}
            onClick={toggleComments}
          >
            <MessageSquare size={14} />
            {threadComments.length} 条留言
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className={deleteHolding ? 'reader-delete-note is-holding' : 'reader-delete-note'}
            style={{ '--delete-hold-ms': `${DELETE_HOLD_MS}ms` } as React.CSSProperties}
            type="button"
            aria-label="长按删除批注"
            onClick={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
            onPointerCancel={clearDeleteHold}
            onPointerDown={startDeleteHold}
            onPointerLeave={clearDeleteHold}
            onPointerUp={clearDeleteHold}
          >
            <Trash2 size={13} />
            <span>长按删除</span>
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="reader-note-comments-region" id={commentsPanelId}>
          <div className="reader-note-comments-panel">
            <header>
              <div>
                <strong>留言</strong>
                <span>{threadComments.length} 条</span>
              </div>
              <button type="button" onClick={toggleComments} aria-label="收起评论">
                <ChevronUp size={14} />
                <span>收起</span>
              </button>
            </header>
            {threadComments.length > 0 ? (
              <div className="reader-comments">
                {threadComments.map((comment) => {
                  const commentAuthor = commentPersona(comment, userProfile, agents);
                  const commentExpanded = expandedCommentIds.has(comment.id);
                  return (
                    <div className="reader-comment" key={comment.id}>
                      <AvatarBadge
                        avatar={commentAuthor.avatar}
                        fallback={commentAuthor.fallback}
                      />
                      <div className="reader-comment-body">
                        <div className="reader-comment-author">
                          <strong>{commentAuthor.nickname}</strong>
                          <em>@{commentAuthor.username}</em>
                          {comment.readingIntent ? (
                            <span>
                              <ReadingIntentLabelContent intent={comment.readingIntent} />
                            </span>
                          ) : null}
                          {comment.questionStatus ? (
                            <span>{questionStatusLabel(comment.questionStatus)}</span>
                          ) : null}
                          <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
                        </div>
                        <CollapsibleMarkdownContent
                          content={comment.content}
                          expanded={commentExpanded}
                          pending={comment.pending}
                          onExpandedChange={(nextExpanded) =>
                            setCommentExpanded(comment.id, nextExpanded)
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="reader-comments-empty">还没有留言</div>
            )}
            <div className="reader-comment-box">
              <textarea
                aria-label="留言内容"
                ref={textareaRef}
                placeholder="给这条批注留言，输入 @ 呼叫助手"
                value={draft}
                onChange={(event) => {
                  setDraft(event.currentTarget.value);
                  updateCaret(event.currentTarget);
                }}
                onClick={(event) => updateCaret(event.currentTarget)}
                onKeyDown={handleKeyDown}
                onKeyUp={handleKeyUp}
                onSelect={(event) => updateCaret(event.currentTarget)}
              />
              {matchedAgents.length > 0 ? (
                <div className="reader-agent-menu">
                  {matchedAgents.map((agent, index) => (
                    <button
                      className={index === selectedMentionIndex ? 'is-active' : ''}
                      key={agent.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectAgent(agent)}
                    >
                      <AvatarBadge avatar={agent.avatar} />
                      <strong>{agent.nickname}</strong>
                      <em>@{agent.username}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="reader-note-footer">
              <div className="reader-comment-agent-tray">
                <span className="reader-comment-mention-label" aria-hidden="true">
                  @
                </span>
                {visibleMentionAgents.map((agent) => (
                  <button
                    className="reader-comment-agent-avatar"
                    key={agent.id}
                    type="button"
                    aria-label={`插入 @${agent.username}`}
                    title={`${agent.nickname} @${agent.username}`}
                    onClick={() => insertAgent(agent)}
                  >
                    <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                  </button>
                ))}
                {overflowMentionAgents.length > 0 ? (
                  <div className="reader-comment-agent-more" onBlur={closeAgentTrayOnBlur}>
                    <button
                      className="reader-comment-agent-more-button"
                      type="button"
                      aria-expanded={agentTrayOpen}
                      aria-label={`更多助手，${overflowMentionAgents.length} 个`}
                      title={`更多助手，${overflowMentionAgents.length} 个`}
                      onClick={() => setAgentTrayOpen((open) => !open)}
                    >
                      <MoreHorizontal size={16} />
                    </button>
                    {agentTrayOpen ? (
                      <div className="reader-comment-agent-more-menu">
                        {overflowMentionAgents.map((agent) => (
                          <button key={agent.id} type="button" onClick={() => insertAgent(agent)}>
                            <AvatarBadge
                              avatar={agent.avatar}
                              fallback={agent.nickname.slice(0, 1)}
                            />
                            <strong>{agent.nickname}</strong>
                            <em>@{agent.username}</em>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <button
                className="reader-add-comment"
                type="button"
                aria-label="添加留言"
                onClick={submit}
              >
                <SubmitShortcutKeys
                  shortcut={messageSendShortcut}
                  shortcutModifier={shortcutModifier}
                />
                <span>发送</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
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
