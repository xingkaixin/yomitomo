import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircleQuestion, Send, X } from 'lucide-react';
import { renderSafeMarkdown } from '@yomitomo/core/article-extraction';
import type {
  MessageSendShortcut,
  PublicAgent,
  ReaderChatMessage,
  ReaderChatState,
  ReaderQuestionContext,
} from '@yomitomo/shared';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import { FloatingComposer } from '../shared/floating-composer';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import { isMessageSendShortcutEvent } from '../reader-shortcuts';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

const CHAT_MAX_TEXTAREA_ROWS = 8;

export type ReaderChatPanelProps = {
  agents: PublicAgent[];
  draftContext?: ReaderQuestionContext;
  error?: string;
  labels?: ReaderUiLabels;
  messageSendShortcut: MessageSendShortcut;
  open: boolean;
  selectedAssistantId?: string;
  sending?: boolean;
  shortcutModifier: string;
  state?: ReaderChatState;
  onClearDraftContext?: () => void;
  onClose: () => void;
  onOpen: () => void;
  onRevealContext?: (context: ReaderQuestionContext) => void | Promise<void>;
  onSelectAssistant?: (assistantId: string) => void;
  onSubmit: (content: string) => void | Promise<void>;
};

export function ReaderChatPanel({
  agents,
  draftContext,
  error,
  labels = defaultReaderUiLabels,
  messageSendShortcut,
  open,
  selectedAssistantId,
  sending = false,
  shortcutModifier,
  state,
  onClearDraftContext,
  onClose,
  onOpen,
  onRevealContext,
  onSelectAssistant,
  onSubmit,
}: ReaderChatPanelProps) {
  const [draft, setDraft] = useState('');
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSession = useMemo(
    () => state?.sessions.find((session) => session.id === state.activeSessionId),
    [state],
  );
  const selectedAssistant =
    agents.find((agent) => agent.id === selectedAssistantId) || agents[0] || null;

  useLayoutEffect(() => {
    resizeTextarea(textareaRef.current);
  }, [draft, open, draftContext]);

  const messageScrollKey = activeSession
    ? activeSession.messages.map((message) => `${message.id}:${message.content.length}`).join('|')
    : '';

  useLayoutEffect(() => {
    if (!open) return;
    const element = messagesRef.current;
    if (!element) return;
    if (typeof element.scrollTo === 'function') {
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    } else {
      element.scrollTop = element.scrollHeight;
    }
  }, [error, messageScrollKey, open]);

  async function submit() {
    const content = draft.trim();
    if (!content || sending || !selectedAssistant) return;
    setDraft('');
    await onSubmit(content);
  }

  function selectAssistant(agent: PublicAgent) {
    onSelectAssistant?.(agent.id);
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.currentTarget.value);
    resizeTextarea(event.currentTarget);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!isMessageSendShortcutEvent(event, messageSendShortcut)) return;
    event.preventDefault();
    void submit();
  }

  if (!open) {
    return (
      <button
        className="reader-chat-fab"
        type="button"
        aria-label={labels.openReaderChat}
        onClick={onOpen}
      >
        <MessageCircleQuestion size={20} strokeWidth={2.15} />
      </button>
    );
  }

  return (
    <section className="reader-chat-panel" aria-label={labels.readerChatAria}>
      <header className="reader-chat-header">
        <div>
          <strong>{labels.readerChat}</strong>
        </div>
        <button type="button" aria-label={labels.collapseReaderChat} onClick={onClose}>
          <X size={16} />
        </button>
      </header>

      <div className="reader-chat-messages" ref={messagesRef}>
        {activeSession?.messages.length ? (
          activeSession.messages.map((message) => (
            <ReaderChatMessageView
              agents={agents}
              key={message.id}
              labels={labels}
              message={message}
              onRevealContext={onRevealContext}
            />
          ))
        ) : (
          <div className="reader-chat-empty">{labels.readerChatEmpty}</div>
        )}
        {error ? <div className="reader-chat-error">{error}</div> : null}
      </div>

      <FloatingComposer
        ref={textareaRef}
        className="reader-chat-composer"
        accessory={
          agents.length > 0 ? (
            <div className="reader-chat-agent-tray" aria-label={labels.readerChatAssistantPicker}>
              <AgentAvatarStack
                agents={agents}
                activeAgentIds={selectedAssistant ? [selectedAssistant.id] : []}
                ariaLabel={labels.readerChatAssistantPicker}
                revealLabelOnDoubleClick={false}
                onAgentClick={selectAssistant}
              />
            </div>
          ) : null
        }
        prefix={
          draftContext ? (
            <div className="reader-chat-context">
              <button
                className="reader-chat-context-jump"
                type="button"
                disabled={!draftContext.anchor || !onRevealContext}
                onClick={() => void onRevealContext?.(draftContext)}
              >
                {draftContext.locationLabel || draftContext.title || labels.currentSelection}
              </button>
              <blockquote>{draftContext.quote}</blockquote>
              {onClearDraftContext ? (
                <button type="button" onClick={onClearDraftContext}>
                  {labels.readerChatClearQuote}
                </button>
              ) : null}
            </div>
          ) : null
        }
        submitDisabled={!draft.trim() || sending || !selectedAssistant}
        submitIcon={<Send size={15} />}
        submitLabel={sending ? labels.sending : labels.send}
        submitTooltip={
          <SubmitShortcutTooltipContent
            label={labels.send}
            shortcut={messageSendShortcut}
            shortcutModifier={shortcutModifier}
          />
        }
        textarea={{
          'aria-label': labels.readerChatContent,
          placeholder: draftContext
            ? labels.readerChatSelectionPlaceholder
            : labels.readerChatPlaceholder,
          rows: 2,
          value: draft,
          onChange: handleDraftChange,
          onKeyDown: handleKeyDown,
        }}
        onSubmit={submit}
      />
    </section>
  );
}

function ReaderChatMessageView({
  agents,
  labels = defaultReaderUiLabels,
  message,
  onRevealContext,
}: {
  agents: PublicAgent[];
  labels?: ReaderUiLabels;
  message: ReaderChatMessage;
  onRevealContext?: (context: ReaderQuestionContext) => void | Promise<void>;
}) {
  const isAssistant = message.role === 'assistant';
  const assistant = isAssistant
    ? agents.find((agent) => agent.id === message.assistantId) || null
    : null;
  const nickname = isAssistant ? assistant?.nickname || labels.assistant : labels.me;
  const avatar = isAssistant ? assistant?.avatar : undefined;
  const fallback = nickname.slice(0, 1) || (isAssistant ? labels.assistant.slice(0, 1) : labels.me);
  const html = isAssistant ? renderSafeMarkdown(message.content || labels.assistantAnswering) : '';

  return (
    <article className={`reader-chat-message is-${message.role}`}>
      {isAssistant ? <AvatarBadge avatar={avatar} fallback={fallback} /> : null}
      <div className="reader-chat-message-bubble">
        <header>
          {isAssistant ? <strong>{nickname}</strong> : <span aria-hidden="true" />}
          <ReaderTooltip content={formatTime(message.createdAt)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt)}
            </time>
          </ReaderTooltip>
        </header>
        {message.context ? (
          <button
            className="reader-chat-message-context"
            type="button"
            disabled={!message.context.anchor || !onRevealContext}
            onClick={() => void onRevealContext?.(message.context!)}
          >
            {message.context.quote}
          </button>
        ) : null}
        {isAssistant ? (
          <div className="reader-chat-markdown" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p>{message.content}</p>
        )}
      </div>
    </article>
  );
}

function resizeTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;

  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight) || 22;
  const verticalPadding =
    Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom);
  const minHeight = Number.parseFloat(styles.minHeight) || lineHeight * 2 + verticalPadding;
  const maxHeight = Math.round(lineHeight * CHAT_MAX_TEXTAREA_ROWS + verticalPadding);

  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}
