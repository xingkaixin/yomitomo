import React, { useEffect, useRef, useState } from 'react';
import { AtSign } from 'lucide-react';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import { getMentionQuery } from '@yomitomo/core';
import { Kbd } from './components/ui/kbd';
import { AvatarBadge, SubmitShortcutKeys } from './reader-component-primitives';
import {
  escapeRegExp,
  matchesAgentMentionQuery,
  mentionDraftWithAgent,
} from './reader-mention-utils';
import type { PendingComposer } from './reader-types';
import { isMessageSendShortcutEvent } from './reader-utils';

export function Composer({
  agents,
  composer,
  messageSendShortcut,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  agents: PublicAgent[];
  composer: PendingComposer;
  messageSendShortcut: MessageSendShortcut;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  const [caretIndex, setCaretIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const [revealedAgentId, setRevealedAgentId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionQuery = getMentionQuery(note, caretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query)).slice(0, 5);
  const mentionedAgents = agents.filter((agent) =>
    new RegExp(`(^|\\s)@${escapeRegExp(agent.username)}(?=[\\s，。,.!?！？、;；:]|$)`, 'u').test(
      note,
    ),
  );
  const canMentionAgents = agents.length > 0;

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length) {
      setSelectedMentionIndex(0);
    }
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    function handleCancelShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    }

    window.addEventListener('keydown', handleCancelShortcut);
    return () => window.removeEventListener('keydown', handleCancelShortcut);
  }, [onCancel]);

  function save() {
    onSave(note);
  }

  function updateCaret(element: HTMLTextAreaElement) {
    setCaretIndex(element.selectionStart);
  }

  function insertAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(note, agent.username, mentionQuery);
    setNote(next.content);
    setCaretIndex(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
      return;
    }

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
      insertAgent(matchedAgents[selectedMentionIndex] || matchedAgents[0]!);
      return;
    }

    if (isMessageSendShortcutEvent(event, messageSendShortcut)) {
      event.preventDefault();
      save();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  return (
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>记录想法</strong>
        </div>
      </header>
      <div className="reader-composer-editor">
        <textarea
          aria-label="想法内容"
          autoFocus
          ref={textareaRef}
          placeholder={canMentionAgents ? '写下你的想法，或 @助手一起看这段…' : '写下你的想法…'}
          value={note}
          onChange={(event) => {
            setNote(event.currentTarget.value);
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
                onClick={() => insertAgent(agent)}
              >
                <AvatarBadge avatar={agent.avatar} />
                <strong>{agent.nickname}</strong>
                <em>@{agent.username}</em>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="reader-composer-actions">
        <div className="reader-composer-agent-tray">
          <span aria-hidden="true">
            <AtSign size={16} />
          </span>
          {canMentionAgents
            ? agents.slice(0, 6).map((agent) => (
                <button
                  className={
                    mentionedAgents.some((item) => item.id === agent.id) ? 'is-active' : ''
                  }
                  key={agent.id}
                  type="button"
                  aria-label={`插入 @${agent.username}`}
                  title={`${agent.nickname} @${agent.username}`}
                  onClick={() => insertAgent(agent)}
                  onDoubleClick={() =>
                    setRevealedAgentId((current) => (current === agent.id ? null : agent.id))
                  }
                >
                  <AvatarBadge avatar={agent.avatar} />
                  {revealedAgentId === agent.id ? (
                    <b>
                      {agent.nickname}
                      <em>@{agent.username}</em>
                    </b>
                  ) : null}
                </button>
              ))
            : null}
        </div>
        <button className="reader-composer-cancel" type="button" onClick={onCancel}>
          <Kbd className="reader-kbd">Esc</Kbd>
          <span>取消</span>
        </button>
        <button type="button" onClick={save}>
          <SubmitShortcutKeys shortcut={messageSendShortcut} shortcutModifier={shortcutModifier} />
          <span>发布</span>
        </button>
      </div>
    </div>
  );
}
