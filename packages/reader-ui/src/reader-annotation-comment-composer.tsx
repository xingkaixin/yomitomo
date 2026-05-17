import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { getMentionQuery } from '@yomitomo/core';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import { AvatarBadge, SubmitShortcutKeys } from './reader-component-primitives';
import { matchesAgentMentionQuery, mentionDraftWithAgent } from './reader-mention-utils';
import { isMessageSendShortcutEvent } from './reader-utils';

export function AnnotationCommentComposer({
  agents,
  focusRequestKey,
  messageSendShortcut,
  placeholder = '写下新的想法，或 @ 助手一起看这段',
  shortcutModifier,
  suggestedAgents,
  submitLabel = '发送',
  onSubmit,
}: {
  agents: PublicAgent[];
  focusRequestKey?: number;
  messageSendShortcut: MessageSendShortcut;
  placeholder?: string;
  shortcutModifier: string;
  suggestedAgents: PublicAgent[];
  submitLabel?: string;
  onSubmit: (content: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [caretIndex, setCaretIndex] = useState(0);
  const [agentTrayOpen, setAgentTrayOpen] = useState(false);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const visibleMentionAgents = suggestedAgents.slice(0, 2);
  const overflowMentionAgents = suggestedAgents.slice(2);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));

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

  useEffect(() => {
    if (focusRequestKey === undefined) return;
    setAgentTrayOpen(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [focusRequestKey]);

  function submit() {
    onSubmit(draft);
    setDraft('');
    setCaretIndex(0);
  }

  function selectAgent(agent: PublicAgent) {
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
      const agent = matchedAgents[selectedMentionIndex] || matchedAgents[0];
      if (agent) selectAgent(agent);
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

  function closeAgentTrayOnBlur(event: React.FocusEvent<HTMLDivElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setAgentTrayOpen(false);
  }

  return (
    <>
      <div className="reader-comment-box">
        <textarea
          aria-label="留言内容"
          ref={textareaRef}
          placeholder={placeholder}
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
                ref={(element) => {
                  mentionCandidateRefs.current[index] = element;
                }}
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
              onClick={() => selectAgent(agent)}
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
                    <button
                      key={agent.id}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectAgent(agent)}
                    >
                      <AvatarBadge avatar={agent.avatar} fallback={agent.nickname.slice(0, 1)} />
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
          aria-label={submitLabel}
          onClick={submit}
        >
          <SubmitShortcutKeys shortcut={messageSendShortcut} shortcutModifier={shortcutModifier} />
          <span>{submitLabel}</span>
        </button>
      </div>
    </>
  );
}
