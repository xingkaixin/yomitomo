import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { PublicAgent } from '@yomitomo/shared';
import { findMentionedAgents, getMentionQuery } from '@yomitomo/core';
import { useTranslation } from 'react-i18next';
import { FloatingComposer } from '@yomitomo/reader-ui/floating-composer';
import {
  matchesAgentMentionQuery,
  mentionDraftWithAgent,
} from '@yomitomo/reader-ui/reader-mention-utils';
import {
  AgentAvatarStack,
  AvatarBadge,
  ReaderTooltip,
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '@yomitomo/reader-ui/reader-component-primitives';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { useCompositionSubmit } from '@yomitomo/reader-ui/use-composition-submit';
import {
  AddThoughtAssistantRunPanel,
  type AddThoughtAgentRun,
} from './app-annotation-discussion-add-run';
import { insertMentionAtCaret } from './app-annotation-discussion-utils';
import { Dialog, DialogContent, DialogOverlay, DialogPortal } from '../components/ui/dialog';

export function AddThoughtDialog({
  agents,
  caretIndex,
  celebrating,
  draft,
  mode,
  onCancel,
  onCaretChange,
  onDraftChange,
  onModeChange,
  onRetry,
  onRetryAll,
  onSubmit,
  runningAgents,
  submitting,
}: {
  agents: PublicAgent[];
  caretIndex: number;
  celebrating: boolean;
  draft: string;
  mode: 'self' | 'assistant';
  onCancel: () => void;
  onCaretChange: (value: number) => void;
  onDraftChange: (value: string) => void;
  onModeChange: (value: 'self' | 'assistant') => void;
  onRetry: (agentId: string) => void;
  onRetryAll: () => void;
  onSubmit: () => void;
  runningAgents: AddThoughtAgentRun[];
  submitting: boolean;
}) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionCandidateRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const shortcutModifier = getShortcutModifier();
  const mentionQuery = mode === 'assistant' ? getMentionQuery(draft, caretIndex) : null;
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents.filter((agent) => matchesAgentMentionQuery(agent, mentionQuery.query));
  const mentionedAgents = findMentionedAgents(draft, agents);
  const canSubmit =
    Boolean(draft.trim()) && !submitting && (mode === 'self' || mentionedAgents.length > 0);
  const showingAssistantRun = mode === 'assistant' && runningAgents.length > 0;
  const runIsActive = runningAgents.some((run) => run.status === 'active');
  const canCancel = !showingAssistantRun || !runIsActive;
  const handleSubmitKeyDown = useCompositionSubmit({
    messageSendShortcut: 'mod-enter',
    onCancel,
    onSubmit,
  });

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
    resizeAddThoughtTextarea();
  }, [draft, mode]);

  function updateCaret(element: HTMLTextAreaElement) {
    onCaretChange(element.selectionStart);
  }

  function resizeAddThoughtTextarea() {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    const maxHeight = 320;
    const nextHeight = Math.min(element.scrollHeight, maxHeight);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function selectMentionAgent(agent: PublicAgent) {
    const next = mentionDraftWithAgent(draft, agent.username, mentionQuery);
    onDraftChange(next.content);
    onCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  function insertAgentMention(agent: PublicAgent) {
    const next = insertMentionAtCaret(draft, agent.username, caretIndex, mentionQuery);
    onDraftChange(next.content);
    onCaretChange(next.caretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(next.caretIndex, next.caretIndex);
    });
  }

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(nextOpen) => {
        if (!nextOpen && canCancel) onCancel();
      }}
    >
      <DialogPortal>
        <DialogOverlay className="annotation-discussion-modal-backdrop">
          <DialogContent
            className="annotation-discussion-add-modal"
            aria-labelledby="annotation-discussion-add-title"
          >
            <header>
              <Plus size={19} />
              <h2 id="annotation-discussion-add-title">{t('discussion.addThought.title')}</h2>
              <ReaderTooltip
                content={<ShortcutTooltipContent keys={['Esc']} label={t('discussion.close')} />}
              >
                <button
                  className="annotation-discussion-add-close"
                  type="button"
                  aria-label={t('discussion.addThought.close')}
                  disabled={!canCancel}
                  onClick={onCancel}
                >
                  <X size={15} />
                </button>
              </ReaderTooltip>
            </header>
            {showingAssistantRun ? (
              <AddThoughtAssistantRunPanel
                celebrating={celebrating}
                runs={runningAgents}
                onClose={onCancel}
                onRetry={onRetry}
                onRetryAll={onRetryAll}
              />
            ) : (
              <FloatingComposer
                ref={textareaRef}
                className="annotation-discussion-add-editor"
                accessory={
                  <div className="annotation-discussion-add-composer-accessory">
                    <div
                      className="annotation-discussion-add-mode"
                      role="tablist"
                      aria-label={t('discussion.addThought.mode')}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'self'}
                        className={mode === 'self' ? 'is-active' : ''}
                        onClick={() => onModeChange('self')}
                      >
                        {t('discussion.addThought.selfMode')}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={mode === 'assistant'}
                        className={mode === 'assistant' ? 'is-active' : ''}
                        onClick={() => onModeChange('assistant')}
                      >
                        {t('discussion.addThought.assistantMode')}
                      </button>
                    </div>
                    {mode === 'assistant' ? (
                      <div className="annotation-discussion-add-agents">
                        <AgentAvatarStack
                          agents={agents}
                          ariaLabel={t('discussion.addThought.insertMention')}
                          onAgentClick={insertAgentMention}
                        />
                      </div>
                    ) : null}
                  </div>
                }
                mentionMenu={
                  matchedAgents.length > 0 ? (
                    <div className="reader-agent-menu annotation-discussion-mention-menu annotation-discussion-add-mention-menu">
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
                          <AvatarBadge
                            avatar={agent.avatar}
                            fallback={agent.nickname.slice(0, 1)}
                          />
                          <span>
                            <strong>{agent.nickname}</strong>
                            <em>@{agent.username}</em>
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null
                }
                submitDisabled={!canSubmit}
                submitIcon={<Plus size={14} />}
                submitLabel={
                  submitting ? t('discussion.addThought.adding') : t('discussion.addThought.add')
                }
                submitTooltip={
                  <SubmitShortcutTooltipContent
                    label={t('discussion.addThought.add')}
                    shortcut="mod-enter"
                    shortcutModifier={shortcutModifier}
                  />
                }
                textarea={{
                  'aria-label':
                    mode === 'self'
                      ? t('discussion.addThought.selfTextarea')
                      : t('discussion.addThought.assistantTextarea'),
                  value: draft,
                  placeholder:
                    mode === 'self'
                      ? t('discussion.addThought.selfPlaceholder')
                      : t('discussion.addThought.assistantPlaceholder'),
                  rows: 1,
                  disabled: submitting,
                  autoFocus: true,
                  onChange: (event) => {
                    onDraftChange(event.currentTarget.value);
                    updateCaret(event.currentTarget);
                    requestAnimationFrame(resizeAddThoughtTextarea);
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
                onSubmit={onSubmit}
              />
            )}
          </DialogContent>
        </DialogOverlay>
      </DialogPortal>
    </Dialog>
  );
}
