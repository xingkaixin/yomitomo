import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, BubbleChatIcon, SentIcon } from '@hugeicons/core-free-icons';
import { useCallback, useEffectEvent, useMemo, useReducer, useRef, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
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
import { openAssistantReferenceFromClick } from '../shell/app-assistant-references';
import {
  discussionReplyPlaceholder,
  formatAbsoluteTime,
  insertMentionAtSelection,
  type DiscussionThread,
} from './app-annotation-discussion-utils';
import { renderDiscussionMessageMarkdown } from './app-annotation-discussion-mention-chips';
import { DiscussionMessage } from './app-annotation-discussion-message';

type DiscussionLayoutMode = AnnotationMessageLayoutMode;
export function DiscussionThreadView({
  annotationAgents,
  articleId,
  deletingCommentId,
  layoutMode,
  onDelete,
  onReplyCaretChange,
  onReplyDraftChange,
  onSubmitReply,
  personaAgents,
  replyCaretIndex,
  replyDraft,
  sendError,
  sendingReply,
  thread,
  userProfile,
}: {
  annotationAgents: PublicAgent[];
  articleId: string;
  deletingCommentId: string | null;
  layoutMode: DiscussionLayoutMode;
  onDelete: (commentId: string) => void;
  onReplyCaretChange: (value: number) => void;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: () => void;
  personaAgents: PublicAgent[];
  replyCaretIndex: number;
  replyDraft: string;
  sendError: string;
  sendingReply: boolean;
  thread: DiscussionThread;
  userProfile: UserProfile;
}) {
  const { t } = useTranslation();
  const messages = thread.replies;
  const hasReplies = messages.length > 0;
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const openedThreadKeyRef = useRef<string | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const scrollFrameRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [{ mentionIndex, mentionQuery: highlightedMentionQuery, showScrollBottom }, dispatch] =
    useReducer(threadViewReducer, {
      mentionIndex: 0,
      mentionQuery: null,
      showScrollBottom: false,
    });
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
  const selectedMentionIndex =
    highlightedMentionQuery === (mentionQuery?.query ?? null) && mentionIndex < matchedAgents.length
      ? mentionIndex
      : 0;
  const shortcutModifier = getShortcutModifier();
  const composerStatus = sendError || (sendingReply ? t('discussion.sending') : '');
  const replyPlaceholder = discussionReplyPlaceholder(thread.root, annotationAgents);
  const className = [
    'annotation-discussion-messages',
    layoutMode === 'left' ? 'is-left-aligned' : 'is-split',
  ].join(' ');
  const readScrollThread = useEffectEvent(() => ({ hasReplies, threadId: thread.root.id }));

  const followThreadContent = useEffectEvent(() => {
    const openedThreadKey = `${thread.root.id}:${hasReplies}`;
    const threadOpened = openedThreadKeyRef.current !== openedThreadKey;
    openedThreadKeyRef.current = openedThreadKey;
    if (!hasReplies) {
      cancelAnimationFrameRef(scrollFrameRef);
      shouldStickToBottomRef.current = false;
      const element = threadScrollRef.current;
      if (threadOpened && element) element.scrollTop = 0;
      dispatch({ type: 'scrollPositionMeasured', atBottom: true });
      return;
    }
    if (threadOpened) shouldStickToBottomRef.current = true;
    if (shouldStickToBottomRef.current) scheduleScrollToBottom('auto');
    else updateScrollBottomVisibility();
  });
  // The markers' keys change with the thread, its messages and the draft, so their refs run
  // after each change; they render after the scroll area and composer so both refs are set.
  const threadContentMarkerRef = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    followThreadContent();
    return () => cancelAnimationFrameRef(scrollFrameRef);
  }, []);
  const replyDraftMarkerRef = useCallback((element: HTMLSpanElement | null) => {
    if (element) resizeReplyTextarea(textareaRef.current);
  }, []);
  const focusIdleComposer = useCallback((element: HTMLElement | null) => {
    if (element) textareaRef.current?.focus();
  }, []);

  function updateCaret(element: HTMLTextAreaElement) {
    onReplyCaretChange(element.selectionStart);
    dispatch({
      type: 'caretMoved',
      mentionQuery: getMentionQuery(element.value, element.selectionStart)?.query ?? null,
    });
  }

  function highlightMention(index: number) {
    dispatch({ type: 'mentionHighlighted', index, mentionQuery: mentionQuery?.query ?? null });
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
      cancelAnimationFrameRef(scrollFrameRef);
      shouldStickToBottomRef.current = false;
      dispatch({ type: 'scrollPositionMeasured', atBottom: true });
      return;
    }
    const element = threadScrollRef.current;
    if (!element) {
      dispatch({ type: 'scrollPositionMeasured', atBottom: true });
      return;
    }
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const atBottom = distance <= 56;
    if (!atBottom) cancelAnimationFrameRef(scrollFrameRef);
    shouldStickToBottomRef.current = atBottom;
    dispatch({ type: 'scrollPositionMeasured', atBottom });
  }

  function scheduleScrollToBottom(behavior: ScrollBehavior) {
    if (!hasReplies) return;
    const scheduledThreadId = thread.root.id;
    const isScheduledThreadShown = () => {
      const latest = readScrollThread();
      return latest.threadId === scheduledThreadId && latest.hasReplies;
    };
    cancelAnimationFrameRef(scrollFrameRef);
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      if (!isScheduledThreadShown()) return;
      if (!shouldStickToBottomRef.current) return;
      const previousScrollHeight = threadScrollRef.current?.scrollHeight ?? 0;
      scrollDiscussionToBottom(behavior);
      scrollFrameRef.current = window.requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        if (!isScheduledThreadShown()) return;
        if ((threadScrollRef.current?.scrollHeight ?? 0) === previousScrollHeight) return;
        if (shouldStickToBottomRef.current) scrollDiscussionToBottom(behavior);
      });
    });
  }

  function scrollDiscussionToBottom(behavior: ScrollBehavior = 'smooth') {
    const latest = readScrollThread();
    if (!latest.hasReplies || latest.threadId !== thread.root.id) return;
    const element = threadScrollRef.current;
    if (!element) return;
    shouldStickToBottomRef.current = true;
    element.scrollTo({ top: element.scrollHeight, behavior });
    dispatch({ type: 'scrollPositionMeasured', atBottom: true });
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
      <div className="annotation-discussion-thread-body">
        <div
          ref={threadScrollRef}
          className="annotation-discussion-thread-scroll"
          onClick={(event) => openAssistantReferenceFromClick(event, articleId)}
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
                  agents={personaAgents}
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
              <HugeiconsIcon icon={BubbleChatIcon} size={24} />
              <strong>{t('discussion.threadView.noDiscussionTitle')}</strong>
              <p>{t('discussion.threadView.noDiscussionDescription')}</p>
            </div>
          )}
        </div>
        <footer
          className="annotation-discussion-composer"
          ref={sendingReply ? undefined : focusIdleComposer}
        >
          {showScrollBottom ? (
            <button
              className="annotation-discussion-scroll-bottom"
              type="button"
              aria-label={t('discussion.threadView.scrollBottom')}
              onClick={() => scrollDiscussionToBottom('smooth')}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} size={16} />
            </button>
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
                      ref={
                        index === selectedMentionIndex ? scrollMentionCandidateIntoView : undefined
                      }
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
            submitIcon={<HugeiconsIcon icon={SentIcon} size={14} />}
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
                requestAnimationFrame(() => resizeReplyTextarea(textareaRef.current));
              },
              onClick: (event) => updateCaret(event.currentTarget),
              onKeyDown: (event) => {
                if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
                  event.preventDefault();
                  highlightMention((selectedMentionIndex + 1) % matchedAgents.length);
                  return;
                }
                if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
                  event.preventDefault();
                  highlightMention(
                    (selectedMentionIndex - 1 + matchedAgents.length) % matchedAgents.length,
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
        <span
          hidden
          key={`${thread.root.id}:${hasReplies}:${rootVersion}:${messagesVersion}`}
          ref={threadContentMarkerRef}
        />
        <span hidden key={`${thread.root.id}:${replyDraft}`} ref={replyDraftMarkerRef} />
      </div>
    </ReaderTooltipProvider>
  );
}

type ThreadViewState = {
  mentionIndex: number;
  mentionQuery: string | null;
  showScrollBottom: boolean;
};

type ThreadViewEvent =
  | { type: 'caretMoved'; mentionQuery: string | null }
  | { type: 'mentionHighlighted'; index: number; mentionQuery: string | null }
  | { type: 'scrollPositionMeasured'; atBottom: boolean };

function threadViewReducer(state: ThreadViewState, event: ThreadViewEvent): ThreadViewState {
  switch (event.type) {
    case 'caretMoved':
      return state.mentionQuery === event.mentionQuery
        ? state
        : { ...state, mentionIndex: 0, mentionQuery: event.mentionQuery };
    case 'mentionHighlighted':
      return { ...state, mentionIndex: event.index, mentionQuery: event.mentionQuery };
    case 'scrollPositionMeasured':
      return state.showScrollBottom === !event.atBottom
        ? state
        : { ...state, showScrollBottom: !event.atBottom };
  }
}

function scrollMentionCandidateIntoView(element: HTMLButtonElement | null) {
  element?.scrollIntoView?.({ block: 'nearest' });
}

function resizeReplyTextarea(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = 'auto';
  const maxHeight = 168;
  const minHeight = 40;
  const nextHeight = Math.max(minHeight, Math.min(element.scrollHeight, maxHeight));
  element.style.height = `${nextHeight}px`;
  element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

function cancelAnimationFrameRef(frameRef: RefObject<number | null>) {
  if (frameRef.current === null) return;
  window.cancelAnimationFrame(frameRef.current);
  frameRef.current = null;
}
