import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, MessageCircle, Send } from 'lucide-react';
import type { PublicAgent, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import { getMentionQuery } from '@yomitomo/core';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import {
  matchesAgentMentionQuery,
  mentionDraftWithAgent,
} from '@yomitomo/reader-ui/reader-mention-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import {
  getShortcutModifier,
  isMessageSendShortcutEvent,
} from '@yomitomo/reader-ui/reader-shortcuts';
import type { AnnotationMessageLayoutMode } from './app-annotation-layout-control';
import { AssistantRuntimeProgressList } from './app-assistant-runtime-progress';
import {
  formatAbsoluteTime,
  insertMentionAtSelection,
  type DiscussionThread,
} from './app-annotation-discussion-utils';
import { DiscussionMessage } from './app-annotation-discussion-message';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;

export function DiscussionThreadView({
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
  const messages = thread.replies;
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const rootThoughtHtml = renderMarkdown(thread.root.content);
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
  const composerStatus = sendError || statusMessage || (sendingReply ? '正在发送' : '');
  const className = [
    'annotation-discussion-messages',
    layoutMode === 'left' ? 'is-left-aligned' : 'is-split',
  ].join(' ');

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
    if (messages.length === 0) {
      cancelScheduledScroll();
      shouldStickToBottomRef.current = false;
      const element = threadScrollRef.current;
      if (element) element.scrollTop = 0;
      setShowScrollBottom(false);
      return;
    }
    shouldStickToBottomRef.current = true;
    scheduleScrollToBottom('auto');
  }, [thread.root.id]);

  useLayoutEffect(() => {
    if (!shouldStickToBottomRef.current) {
      updateScrollBottomVisibility();
      return;
    }
    scheduleScrollToBottom('auto');
  }, [messagesVersion, rootVersion, thread.root.id]);

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
    cancelScheduledScroll();
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (!shouldStickToBottomRef.current) return;
      scrollDiscussionToBottom(behavior);
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
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

  return (
    <div className="annotation-discussion-thread-body">
      <div
        ref={threadScrollRef}
        className="annotation-discussion-thread-scroll"
        onScroll={updateScrollBottomVisibility}
      >
        <section className="annotation-discussion-root-thought" aria-label="想法内容">
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
            {thread.pending ? <span>助手回复中</span> : null}
          </div>
        </section>
        <div className="annotation-discussion-thread-divider" role="separator">
          <span>讨论展开</span>
        </div>
        {messages.length > 0 ? (
          <div className={className}>
            {messages.map((message) => (
              <DiscussionMessage
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
            <strong>当前没有讨论</strong>
            <p>这条想法还没有回复。</p>
          </div>
        )}
      </div>
      <footer className="annotation-discussion-composer">
        {showScrollBottom ? (
          <button
            className="annotation-discussion-scroll-bottom"
            type="button"
            aria-label="滚动到底部"
            onClick={() => scrollDiscussionToBottom('smooth')}
          >
            <ChevronDown size={16} />
          </button>
        ) : null}
        <FloatingComposer
          ref={textareaRef}
          className="annotation-discussion-composer-input"
          accessory={
            annotationAgents.length > 0 ? (
              <div className="annotation-discussion-agent-dock" aria-label="可提及助手">
                <AgentAvatarStack
                  agents={annotationAgents}
                  ariaLabel="可提及助手"
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
          status={composerStatus || undefined}
          submitDisabled={!replyDraft.trim() || sendingReply}
          submitIcon={<Send size={14} />}
          submitLabel="回复"
          submitTooltip={
            <SubmitShortcutTooltipContent
              label="回复"
              shortcut="mod-enter"
              shortcutModifier={shortcutModifier}
            />
          }
          textarea={{
            value: replyDraft,
            placeholder: '回复这条想法，输入 @助手 可邀请助手参与讨论',
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
              if (isMessageSendShortcutEvent(event, 'mod-enter')) {
                event.preventDefault();
                handleSubmitReply();
              }
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
  );
}
