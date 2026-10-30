import React, { useCallback, useReducer, useRef } from 'react';
import { getMentionQuery } from '@yomitomo/core';
import type { MessageSendShortcut, PublicAgent } from '@yomitomo/shared';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import { matchesAgentMentionQuery, mentionDraftWithAgent } from '../reader-mention-utils';
import { useCompositionSubmit } from '../use-composition-submit';

type CommentComposerState = {
  caretIndex: number;
  draft: string;
  mentionHighlight: { index: number; query: string | null };
};

type CommentComposerEvent =
  | { type: 'agentMentioned'; caretIndex: number; draft: string }
  | { type: 'caretMoved'; caretIndex: number }
  | { type: 'draftEdited'; caretIndex: number; draft: string }
  | { type: 'mentionHighlightMoved'; index: number; query: string | null }
  | { type: 'submitted' };

const initialCommentComposerState: CommentComposerState = {
  caretIndex: 0,
  draft: '',
  mentionHighlight: { index: 0, query: null },
};

function commentComposerReducer(
  state: CommentComposerState,
  event: CommentComposerEvent,
): CommentComposerState {
  switch (event.type) {
    case 'agentMentioned':
    case 'draftEdited':
      return { ...state, caretIndex: event.caretIndex, draft: event.draft };
    case 'caretMoved':
      return state.caretIndex === event.caretIndex
        ? state
        : { ...state, caretIndex: event.caretIndex };
    case 'mentionHighlightMoved':
      return { ...state, mentionHighlight: { index: event.index, query: event.query } };
    case 'submitted':
      return { ...state, caretIndex: 0, draft: '' };
  }
}

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
  const [{ caretIndex, draft, mentionHighlight }, dispatch] = useReducer(
    commentComposerReducer,
    initialCommentComposerState,
  );
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));
  const currentMentionQuery = mentionQuery?.query ?? null;
  const selectedMentionIndex =
    mentionHighlight.query === currentMentionQuery && mentionHighlight.index < matchedAgents.length
      ? mentionHighlight.index
      : 0;

  // Recreated when focusRequestKey changes, so each new request focuses the textarea after that commit.
  const attachTextarea = useCallback(
    (textarea: HTMLTextAreaElement) => {
      textareaRef.current = textarea;
      const frame =
        focusRequestKey === undefined ? 0 : requestAnimationFrame(() => textarea.focus());
      return () => {
        cancelAnimationFrame(frame);
        textareaRef.current = null;
      };
    },
    [focusRequestKey],
  );

  function submit() {
    onSubmit(draft);
    dispatch({ type: 'submitted' });
  }

  const handleSubmitKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: submit,
  });

  function selectAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(draft, agent.username, mentionQuery);
    dispatch({ type: 'agentMentioned', caretIndex: next.caretIndex, draft: next.content });
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function updateCaret(element: HTMLTextAreaElement) {
    dispatch({ type: 'caretMoved', caretIndex: element.selectionStart });
  }

  function highlightMention(index: number) {
    dispatch({ type: 'mentionHighlightMoved', index, query: currentMentionQuery });
    mentionCandidateRefs.current[index]?.scrollIntoView?.({ block: 'nearest' });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (matchedAgents.length > 0 && event.key === 'ArrowDown') {
      event.preventDefault();
      highlightMention((selectedMentionIndex + 1) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'ArrowUp') {
      event.preventDefault();
      highlightMention((selectedMentionIndex - 1 + matchedAgents.length) % matchedAgents.length);
      return;
    }

    if (matchedAgents.length > 0 && event.key === 'Tab') {
      event.preventDefault();
      const agent = matchedAgents[selectedMentionIndex] || matchedAgents[0];
      if (agent) selectAgent(agent);
      return;
    }

    handleSubmitKeyDown(event);
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  return (
    <>
      <div className="reader-comment-box">
        <textarea
          aria-label="留言内容"
          ref={attachTextarea}
          placeholder={placeholder}
          value={draft}
          onChange={(event) =>
            dispatch({
              type: 'draftEdited',
              caretIndex: event.currentTarget.selectionStart,
              draft: event.currentTarget.value,
            })
          }
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
          {suggestedAgents.length > 0 ? (
            <AgentAvatarStack
              agents={suggestedAgents}
              ariaLabel="可 @ 助手"
              onAgentClick={selectAgent}
            />
          ) : null}
        </div>
        <ReaderTooltip
          content={
            <SubmitShortcutTooltipContent
              label={submitLabel}
              shortcut={messageSendShortcut}
              shortcutModifier={shortcutModifier}
            />
          }
        >
          <button
            className="reader-add-comment"
            type="button"
            aria-label={submitLabel}
            onClick={submit}
          >
            <span>{submitLabel}</span>
          </button>
        </ReaderTooltip>
      </div>
    </>
  );
}
