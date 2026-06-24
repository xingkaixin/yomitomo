import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, MessageCircle, Send } from 'lucide-react';
import type { PublicAgent, UserProfile } from '@yomitomo/shared';
import { getMentionQuery } from '@yomitomo/core';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import {
  matchesAgentMentionQuery,
  mentionDraftWithAgent,
} from '@yomitomo/reader-ui/reader-mention-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltipProvider,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useCompositionSubmit } from '@yomitomo/reader-ui/use-composition-submit';
import type { AnnotationMessageLayoutMode } from './app-annotation-layout-control';
import { AssistantRuntimeProgressList } from '../shell/app-assistant-runtime-progress';
import {
  discussionReplyPlaceholder,
  formatAbsoluteTime,
  insertMentionAtSelection,
  type DiscussionThread,
} from './app-annotation-discussion-utils';
import { renderDiscussionMessageMarkdown } from './app-annotation-discussion-mention-chips';
import { DiscussionMessage } from './app-annotation-discussion-message';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;
type ActiveReplyAgent = {
  agent: PublicAgent;
  status: 'active' | 'queued';
};

export function DiscussionThreadView({
  activeReplyAgents,
  annotationAgents,
  deletingCommentId,
  layoutMode,
  onDelete,
  onReplyCaretChange,
  onReplyDraftChange,
  onSubmitReply,
  replyCaretIndex,
  replyDraft,
  sendError,
  sendingReply,
  statusMessage,
  thread,
  userProfile,
}: {
  activeReplyAgents?: ActiveReplyAgent[];
  annotationAgents: PublicAgent[];
  deletingCommentId: string | null;
  layoutMode: DiscussionLayoutMode;
  onDelete: (commentId: string) => void;
  onReplyCaretChange: (value: number) => void;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  replyCaretIndex: number;
  replyDraft: string;
  sendError: string;
  sendingReply: boolean;
  statusMessage: string;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const messages = thread.replies;
  const hasReplies = messages.length > 0;
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const activeThreadIdRef = useRef(thread.root.id);
  const hasRepliesRef = useRef(false);
  const shouldStickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const rootThoughtHtml = useMemo(
    () =>
      renderDiscussionMessageMarkdown(thread.root.content, annotationAgents, thread.root.author),
    [annotationAgents, thread.root.author, thread.root.content],
  );
  const rootVersion = `${thread.root.content}:${thread.root.pending ? 'pending' : 'ready'}`;
  const messagesVersion = messages
    .map((message) => `${message.id}:${message.content}:${message.pending ? 'pending' : 'ready'}`)
    .join('|');
  const mentionQuery = getMentionQuery(replyDraft, replyCaretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : annotationAgents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));
  const shortcutModifier = getShortcutModifier();
  const hasReplyAgents = (activeReplyAgents?.length || 0) > 0;
  const composerStatus =
    sendError ||
    (!hasReplyAgents && (statusMessage || (sendingReply ? t('discussion.sending') : '')));
  const replyPlaceholder = discussionReplyPlaceholder(thread.root, annotationAgents);
  const className = [
    'annotation-discussion-messages',
    layoutMode === 'left' ? 'is-left-aligned' : 'is-split',
  ].join(' ');
  const bodyClassName = [
    'annotation-discussion-thread-body',
    hasReplyAgents ? 'has-reply-agents' : '',
  ]
    .filter(Boolean)
    .join(' ');
  activeThreadIdRef.current = thread.root.id;
  hasRepliesRef.current = hasReplies;

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    mentionCandidateRefs.current[selectedMentionIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [selectedMentionIndex]);

  useLayoutEffect(() => {
    if (!hasReplies) {
      cancelScheduledScroll();
      shouldStickToBottomRef.current = false;
      const element = threadScrollRef.current;
      if (element) element.scrollTop = 0;
      setShowScrollBottom(false);
      return;
    }
    shouldStickToBottomRef.current = true;
    scheduleScrollToBottom('auto');
    return () => cancelScheduledScroll();
  }, [hasReplies, thread.root.id]);

  useLayoutEffect(() => {
    if (!hasReplies) {
      cancelScheduledScroll();
      shouldStickToBottomRef.current = false;
      updateScrollBottomVisibility();
      return;
    }
    if (!shouldStickToBottomRef.current) {
      updateScrollBottomVisibility();
      return;
    }
    scheduleScrollToBottom('auto');
    return () => cancelScheduledScroll();
  }, [hasReplies, messagesVersion, rootVersion, thread.root.id]);

  useEffect(
    () => () => {
      cancelScheduledScroll();
    },
    [],
  );

  useEffect(() => {
    resizeReplyTextarea();
  }, [replyDraft, thread.root.id]);

  useEffect(() => {
    if (sendingReply) return;
    textareaRef.current?.focus();
  }, [sendingReply]);

  function updateCaret(element: HTMLTextAreaElement) {
    onReplyCaretChange(element.selectionStart);
  }

  function resizeReplyTextarea() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    const maxHeight = 168;
    const minHeight = 40;
    const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function selectMentionAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(replyDraft, agent.username, mentionQuery);
    onReplyDraftChange(next.content);
    onReplyCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function insertAgentMention(agent: PublicAgent) {
    const element = textareaRef.current;
    const selectionStart = element?.selectionStart ?? replyCaretIndex;
    const selectionEnd = element?.selectionEnd ?? selectionStart;
    const next = insertMentionAtSelection(
      replyDraft,
      agent.username,
      selectionStart,
      selectionEnd,
      mentionQuery,
    );
    onReplyDraftChange(next.content);
    onReplyCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function updateScrollBottomVisibility() {
    if (!hasReplies) {
      cancelScheduledScroll();
      shouldStickToBottomRef.current = false;
      setShowScrollBottom(false);
      return;
    }
    const element = threadScrollRef.current;
    if (!element) {
      setShowScrollBottom(false);
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distance <= 56;
    if (!atBottom) cancelScheduledScroll();
    shouldStickToBottomRef.current = atBottom;
    setShowScrollBottom(!atBottom);
  }

  function scheduleScrollToBottom(behavior: ScrollBehavior) {
    if (!hasReplies) return;
    const scheduledThreadId = thread.root.id;
    cancelScheduledScroll();
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (activeThreadIdRef.current !== scheduledThreadId) return;
      if (!hasRepliesRef.current) return;
      if (!shouldStickToBottomRef.current) return;
      const previousScrollHeight = threadScrollRef.current?.scrollHeight ?? 0;
      scrollDiscussionToBottom(behavior);
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        if (activeThreadIdRef.current !== scheduledThreadId) return;
        if (!hasRepliesRef.current) return;
        if ((threadScrollRef.current?.scrollHeight ?? 0) === previousScrollHeight) return;
        if (shouldStickToBottomRef.current) scrollDiscussionToBottom(behavior);
      });
    });
  }

  function cancelScheduledScroll() {
    if (scrollFrameRef.current === null) return;
    window.cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = null;
  }

  function scrollDiscussionToBottom(behavior: ScrollBehavior = 'smooth') {
    if (!hasRepliesRef.current) return;
    if (activeThreadIdRef.current !== thread.root.id) return;
    const element = threadScrollRef.current;
    if (!element) return;
    shouldStickToBottomRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior });
    setShowScrollBottom(false);
  }

  function handleSubmitReply() {
    updateScrollBottomVisibility();
    onSubmitReply();
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  const handleSubmitKeyDown = useCompositionSubmit({
    messageSendShortcut: 'mod-enter',
    onSubmit: handleSubmitReply,
  });

  return (
    <ReaderTooltipProvider>
      <div className={bodyClassName}>
        <div
          ref={threadScrollRef}
          className="annotation-discussion-thread-scroll"
          onScroll={updateScrollBottomVisibility}
        >
          <section
            className="annotation-discussion-root-thought"
            aria-label={t('discussion.threadView.rootThought')}
          >
            <div className="annotation-discussion-root-thought-content">
              <AssistantRuntimeProgressList progress={thread.root.assistantProgress} />
              <div dangerouslySetInnerHTML={{ __html: rootThoughtHtml }} />
            </div>
            <div className="annotation-discussion-thread-meta">
              <ReaderTooltip content={formatAbsoluteTime(thread.root.createdAt)}>
                <time dateTime={thread.root.createdAt} tabIndex={0}>
                  {formatAbsoluteTime(thread.root.createdAt)}
                </time>
              </ReaderTooltip>
              {thread.pending ? <span>{t('discussion.threadView.assistantReplying')}</span> : null}
            </div>
          </section>
          <div className="annotation-discussion-thread-divider" role="separator">
            <span>{t('discussion.threadView.expanded')}</span>
          </div>
          {messages.length > 0 ? (
            <div className={className}>
              {messages.map((message) => (
                <DiscussionMessage
                  agents={annotationAgents}
                  isDeleting={deletingCommentId === message.id}
                  key={message.id}
                  message={message}
                  userProfile={userProfile}
                  onDelete={() => onDelete(message.id)}
                />
              ))}
            </div>
          ) : (
            <div className="annotation-discussion-reply-empty">
              <MessageCircle size={24} />
              <strong>{t('discussion.threadView.noDiscussionTitle')}</strong>
              <p>{t('discussion.threadView.noDiscussionDescription')}</p>
            </div>
          )}
        </div>
        <footer className="annotation-discussion-composer">
          {showScrollBottom ? (
            <button
              className="annotation-discussion-scroll-bottom"
              type="button"
              aria-label={t('discussion.threadView.scrollBottom')}
              onClick={() => scrollDiscussionToBottom('smooth')}
            >
              <ChevronDown size={16} />
            </button>
          ) : null}
          {activeReplyAgents && activeReplyAgents.length > 0 ? (
            <ReplyAgentQueueTray agents={activeReplyAgents} />
          ) : null}
          <FloatingComposer
            ref={textareaRef}
            className="annotation-discussion-composer-input"
            accessory={
              annotationAgents.length > 0 ? (
                <div
                  className="annotation-discussion-agent-dock"
                  aria-label={t('discussion.threadView.mentionableAssistants')}
                >
                  <AgentAvatarStack
                    agents={annotationAgents}
                    ariaLabel={t('discussion.threadView.mentionableAssistants')}
                    onAgentClick={insertAgentMention}
                  />
                </div>
              ) : undefined
            }
            mentionMenu={
              matchedAgents.length > 0 ? (
                <div className="reader-agent-menu annotation-discussion-mention-menu">
                  {matchedAgents.map((agent, index) => (
                    <button
                      className={index === selectedMentionIndex ? 'is-active' : ''}
                      key={agent.id}
                      ref={(element) => {
                        mentionCandidateRefs.current[index] = element;
                      }}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectMentionAgent(agent)}
                    >
                      <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
                      <span>
                        <strong>{agent.nickname}</strong>
                        <em>@{agent.username}</em>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null
            }
            mentionAgents={annotationAgents}
            status={composerStatus || undefined}
            submitDisabled={!replyDraft.trim() || sendingReply}
            submitIcon={<Send size={14} />}
            submitLabel={t('discussion.threadView.reply')}
            submitTooltip={
              <SubmitShortcutTooltipContent
                label={t('discussion.threadView.reply')}
                shortcut="mod-enter"
                shortcutModifier={shortcutModifier}
              />
            }
            textarea={{
              value: replyDraft,
              placeholder: replyPlaceholder,
              rows: 1,
              disabled: sendingReply,
              onChange: (event) => {
                onReplyDraftChange(event.currentTarget.value);
                updateCaret(event.currentTarget);
                requestAnimationFrame(resizeReplyTextarea);
              },
              onClick: (event) => updateCaret(event.currentTarget),
              onKeyDown: (event) => {
                if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
                  event.preventDefault();
                  setSelectedMentionIndex((index) => (index + 1) % matchedAgents.length);
                  return;
                }
                if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
                  event.preventDefault();
                  setSelectedMentionIndex(
                    (index) => (index - 1 + matchedAgents.length) % matchedAgents.length,
                  );
                  return;
                }
                if (matchedAgents.length > 0 && event.key === 'Tab') {
                  event.preventDefault();
                  const agent = matchedAgents[selectedMentionIndex] || matchedAgents[0];
                  if (agent) selectMentionAgent(agent);
                  return;
                }
                handleSubmitKeyDown(event);
              },
              onKeyUp: (event) => {
                if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp')
                  return;
                updateCaret(event.currentTarget);
              },
              onSelect: (event) => updateCaret(event.currentTarget),
            }}
            onSubmit={handleSubmitReply}
          />
        </footer>
      </div>
    </ReaderTooltipProvider>
  );
}

function ReplyAgentQueueTray({ agents }: { agents: ActiveReplyAgent[] }) {
  const { t } = useTranslation();
  const activeAgent = agents.find((run) => run.status === 'active')?.agent || agents[0]?.agent;
  const queuedAgents = agents
    .filter((run) => run.agent.id !== activeAgent?.id)
    .map((run) => run.agent);
  const previousActiveAgentIdRef = useRef(activeAgent?.id);
  const [promotedAgentId, setPromotedAgentId] = useState<string | null>(null);

  useEffect(() => {
    const previousActiveAgentId = previousActiveAgentIdRef.current;
    if (activeAgent?.id && previousActiveAgentId && activeAgent.id !== previousActiveAgentId) {
      setPromotedAgentId(activeAgent.id);
      const timeout = window.setTimeout(() => setPromotedAgentId(null), 520);
      previousActiveAgentIdRef.current = activeAgent.id;
      return () => window.clearTimeout(timeout);
    }
    previousActiveAgentIdRef.current = activeAgent?.id;
  }, [activeAgent?.id]);

  if (!activeAgent) return null;

  return (
    <div
      className="annotation-discussion-reply-agent-tray"
      role="region"
      aria-label={t('discussion.threadView.replyQueue')}
    >
      <div className="annotation-discussion-reply-agent-active">
        <span
          className={[
            'annotation-discussion-reply-agent-active-avatar',
            promotedAgentId === activeAgent.id ? 'is-promoted' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          title={activeAgent.nickname}
        >
          <AvatarBadge avatar={activeAgent.avatar} fallback={activeAgent.nickname.slice(0, 1)} />
        </span>
        <span className="annotation-discussion-typing-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      {queuedAgents.length > 0 ? (
        <div className="annotation-discussion-reply-agent-queue">
          {queuedAgents.map((agent, index) => (
            <span
              className="annotation-discussion-reply-agent-queued"
              key={agent.id}
              style={{ '--reply-agent-index': index } as CSSProperties}
              title={agent.nickname}
            >
              <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
