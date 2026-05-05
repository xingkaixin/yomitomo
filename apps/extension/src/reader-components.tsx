import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaseSensitive,
  Check,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Plus,
  Save,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import type {
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import {
  agentReadingIntentLabel,
  agentReadingIntentOptions,
  renderMarkdown,
} from '@yomitomo/shared';
import {
  annotationPersona as annotationAuthor,
  annotationTypeLabel,
  commentPersona,
  getMentionQuery,
  isQuestionComment,
  questionStatusLabel,
  questionStatusOrOpen,
  replaceMentionQuery,
} from '@yomitomo/core';
import { Kbd } from './components/ui/kbd';

export type SelectionMenuAction = {
  x: number;
  y: number;
};

export type PendingComposer = {
  x: number;
  y: number;
};

export type ActiveConnection = {
  path: string;
  color: string;
};

export type ReaderSettings = {
  fontSize: number;
  contentWidth: number;
};

export type VirtualCursorState = {
  id: string;
  visible: boolean;
  leaving?: boolean;
  x: number;
  y: number;
  label: string;
  offscreen: 'above' | 'below' | null;
  agent?: PublicAgent;
};

export type HighlightChoiceAction = {
  x: number;
  y: number;
};

const DELETE_HOLD_MS = 1600;
const annotationTypeOptions: AnnotationType[] = [
  'key_point',
  'assumption',
  'concept',
  'question',
  'quote',
];

function moveAnnotationTypeSelection(
  event: React.KeyboardEvent<HTMLDivElement>,
  current: AnnotationType,
  onChange: (nextType: AnnotationType) => void,
) {
  const currentIndex = annotationTypeOptions.indexOf(current);
  const lastIndex = annotationTypeOptions.length - 1;
  const nextIndexByKey: Record<string, number> = {
    ArrowRight: Math.min(currentIndex + 1, lastIndex),
    ArrowDown: Math.min(currentIndex + 1, lastIndex),
    ArrowLeft: Math.max(currentIndex - 1, 0),
    ArrowUp: Math.max(currentIndex - 1, 0),
    Home: 0,
    End: lastIndex,
  };
  const nextIndex = nextIndexByKey[event.key];
  if (nextIndex === undefined) return;

  event.preventDefault();
  onChange(annotationTypeOptions[nextIndex]);
}

export function SelectionMenu({
  action,
  agents,
  desktopConnected,
  onAnnotate,
  onRequestAgentAction,
}: {
  action: SelectionMenuAction;
  agents: PublicAgent[];
  desktopConnected: boolean;
  onAnnotate: () => void;
  onRequestAgentAction: (intent: AgentReadingIntent, agent: PublicAgent) => void;
}) {
  const [selectedIntent, setSelectedIntent] = useState<AgentReadingIntent | null>(null);
  const selectedIntentOption = agentReadingIntentOptions.find(
    (option) => option.value === selectedIntent,
  );
  const agentActionsDisabled = !desktopConnected || agents.length === 0;
  const agentActionHint = !desktopConnected
    ? '桌面端未连接'
    : agents.length === 0
      ? '暂无阅读助手'
      : '';

  return (
    <div className="reader-selection-menu" style={{ left: action.x, top: action.y }}>
      <button className="reader-selection-primary" type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        我的批注
      </button>
      <div className="reader-selection-agent-actions">
        <div className="reader-selection-heading">
          <span>让助手处理</span>
          {agentActionHint ? <em>{agentActionHint}</em> : null}
        </div>
        <div className="reader-selection-action-grid">
          {agentReadingIntentOptions.map((option) => (
            <button
              aria-pressed={selectedIntent === option.value}
              className={selectedIntent === option.value ? 'is-active' : ''}
              disabled={agentActionsDisabled}
              key={option.value}
              type="button"
              onClick={() =>
                setSelectedIntent((current) => (current === option.value ? null : option.value))
              }
            >
              <strong>{option.shortLabel}</strong>
            </button>
          ))}
        </div>
        {selectedIntentOption && !agentActionsDisabled ? (
          <div className="reader-selection-agent-list">
            <strong>{selectedIntentOption.label}</strong>
            {agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                onClick={() => onRequestAgentAction(selectedIntentOption.value, agent)}
              >
                <AvatarBadge avatar={agent.avatar} />
                <span>{agent.nickname}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function HighlightChoiceMenu({
  action,
  agents,
  annotations,
  userProfile,
  onCancel,
  onSelect,
}: {
  action: HighlightChoiceAction;
  agents: PublicAgent[];
  annotations: Annotation[];
  userProfile: UserProfile;
  onCancel: () => void;
  onSelect: (annotationId: string) => void;
}) {
  return (
    <div className="reader-highlight-choice-menu" style={{ left: action.x, top: action.y }}>
      <header>
        <strong>选择批注</strong>
        <button type="button" onClick={onCancel} aria-label="关闭批注选择">
          <X size={14} />
        </button>
      </header>
      {annotations.map((annotation) => {
        const persona = annotationAuthor(annotation, userProfile, agents);
        const labels = [
          annotation.annotationType ? annotationTypeLabel(annotation.annotationType) : '',
          annotation.readingIntent ? agentReadingIntentLabel(annotation.readingIntent) : '',
        ].filter(Boolean);
        return (
          <button key={annotation.id} type="button" onClick={() => onSelect(annotation.id)}>
            <AvatarBadge avatar={persona.avatar} fallback={persona.fallback} />
            <span>
              <strong>{persona.nickname}</strong>
              <em>@{persona.username}</em>
            </span>
            {labels.length > 0 ? <b>{labels.join(' · ')}</b> : null}
          </button>
        );
      })}
    </div>
  );
}

export function AnnotationConnection({ connection }: { connection: ActiveConnection }) {
  return (
    <svg className="reader-annotation-connection" aria-hidden="true">
      <path d={connection.path} style={{ stroke: connection.color }} />
    </svg>
  );
}

export function VirtualCursor({ cursor }: { cursor: VirtualCursorState }) {
  const color = cursor.agent?.annotationColor || '#b7352c';
  return (
    <div
      className={[
        'reader-virtual-cursor',
        cursor.offscreen ? 'is-offscreen' : '',
        cursor.leaving ? 'is-leaving' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ left: cursor.x, top: cursor.y, '--cursor-color': color } as React.CSSProperties}
    >
      <div className="reader-virtual-pointer" />
      <div className="reader-virtual-label">
        <AvatarBadge avatar={cursor.agent?.avatar} />
        {cursor.label}
      </div>
    </div>
  );
}

function AvatarBadge({ avatar, fallback = 'AI' }: { avatar?: string; fallback?: string }) {
  const value = avatar || fallback;
  const image = isImageAvatar(value);
  const svg = isSvgAvatar(value);
  const classes = ['reader-avatar-badge', image ? 'is-image' : '', svg ? 'is-svg' : '']
    .filter(Boolean)
    .join(' ');
  return <span className={classes}>{image ? <img alt="" src={value} /> : value}</span>;
}

export function EmptyNotes() {
  return (
    <div className="reader-empty">
      <strong>选择一段文字开始批注</strong>
      <p>选中阅读器内的文本后，可以写下想法。高亮和讨论会保存在当前文章下。</p>
    </div>
  );
}

export function QuestionPanel({
  agents,
  annotations,
  userProfile,
  onFocus,
  onSetAnnotationQuestionStatus,
  onSetCommentQuestionStatus,
}: {
  agents: PublicAgent[];
  annotations: Annotation[];
  userProfile: UserProfile;
  onFocus: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
}) {
  const questions = annotations.flatMap((annotation) => {
    const annotationAuthorPersona = annotationAuthor(annotation, userProfile, agents);
    const annotationQuestion =
      annotation.annotationType === 'question' || annotation.questionStatus
        ? [
            {
              id: annotation.id,
              annotationId: annotation.id,
              status: questionStatusOrOpen(annotation.questionStatus),
              label: annotationAuthorPersona.nickname,
              text: annotation.anchor.exact,
              quote: annotation.anchor.exact,
              setStatus: (status: QuestionStatus) =>
                onSetAnnotationQuestionStatus(annotation.id, status),
            },
          ]
        : [];
    const commentQuestions = annotation.comments.filter(isQuestionComment).map((comment) => {
      const commentAuthorPersona = commentPersona(comment, userProfile, agents);
      return {
        id: comment.id,
        annotationId: annotation.id,
        status: questionStatusOrOpen(comment.questionStatus),
        label: commentAuthorPersona.nickname,
        text: comment.content,
        quote: annotation.anchor.exact,
        setStatus: (status: QuestionStatus) =>
          onSetCommentQuestionStatus(annotation.id, comment.id, status),
      };
    });
    return [...annotationQuestion, ...commentQuestions];
  });
  const openQuestions = questions.filter((question) => question.status === 'open');

  if (questions.length === 0) return null;

  return (
    <section className="reader-question-panel" aria-label="未决问题">
      <header>
        <div>
          <strong>未决问题</strong>
          <span>{openQuestions.length} 个待推进</span>
        </div>
      </header>
      <div className="reader-question-list">
        {questions.map((question) => (
          <article className={`is-${question.status}`} key={question.id}>
            <button
              className="reader-question-open"
              type="button"
              onClick={() => onFocus(question.annotationId)}
            >
              <span className="reader-question-meta">
                <strong>{question.label}</strong>
                <i>{questionStatusLabel(question.status)}</i>
              </span>
              <span>{question.text}</span>
              <em>“{question.quote}”</em>
            </button>
            <div className="reader-question-actions">
              <button type="button" onClick={() => onFocus(question.annotationId)}>
                {question.status === 'answered' ? '查看' : '回答'}
              </button>
              {question.status === 'parked' ? (
                <button type="button" onClick={() => question.setStatus('open')}>
                  恢复
                </button>
              ) : null}
              {question.status === 'open' ? (
                <button type="button" onClick={() => question.setStatus('parked')}>
                  搁置
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function AgentAnnotateMenu({
  agents,
  annotatingAgents,
  onCancel,
  onStartAgent,
}: {
  agents: PublicAgent[];
  annotatingAgents: string[];
  onCancel: () => void;
  onStartAgent: (agent: PublicAgent, readingIntent: AgentReadingIntent) => void;
}) {
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentIntents, setAgentIntents] = useState<Record<string, AgentReadingIntent>>({});
  const [choosingAgentId, setChoosingAgentId] = useState<string | null>(null);
  const selectedAgents = agents.filter(
    (agent) => selectedAgentIds.includes(agent.id) && !annotatingAgents.includes(agent.id),
  );

  useEffect(() => {
    setSelectedAgentIds((ids) =>
      ids.filter((id) => agents.some((agent) => agent.id === id) && !annotatingAgents.includes(id)),
    );
  }, [agents, annotatingAgents]);

  function toggleAgent(agent: PublicAgent) {
    if (annotatingAgents.includes(agent.id)) return;
    if (selectedAgentIds.includes(agent.id)) {
      setSelectedAgentIds((ids) => ids.filter((id) => id !== agent.id));
      setAgentIntents((current) => {
        const next = { ...current };
        delete next[agent.id];
        return next;
      });
      setChoosingAgentId((id) => (id === agent.id ? null : id));
      return;
    }
    setChoosingAgentId((id) => (id === agent.id ? null : agent.id));
  }

  function startSelectedAgents() {
    for (const agent of selectedAgents) onStartAgent(agent, readingIntentForAgent(agent.id));
    setSelectedAgentIds([]);
  }

  function readingIntentForAgent(agentId: string): AgentReadingIntent {
    return agentIntents[agentId] || agentReadingIntentOptions[0]!.value;
  }

  function setAgentReadingIntent(agentId: string, intent: AgentReadingIntent) {
    setAgentIntents((current) => ({ ...current, [agentId]: intent }));
    setSelectedAgentIds((ids) => (ids.includes(agentId) ? ids : [...ids, agentId]));
    setChoosingAgentId(null);
  }

  return (
    <div className="reader-agent-annotate-menu">
      <header>
        <strong>助手精读</strong>
        <span>给每个助手选择动作，再开始主动批注</span>
      </header>
      {agents.map((agent) => {
        const running = annotatingAgents.includes(agent.id);
        const selected = selectedAgentIds.includes(agent.id);
        const readingIntent = agentIntents[agent.id] || null;
        return (
          <div
            className={[
              'reader-agent-option',
              running ? 'is-running' : '',
              selected ? 'is-selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={agent.id}
          >
            <button
              aria-pressed={selected}
              className="reader-agent-select"
              disabled={running}
              type="button"
              onClick={() => toggleAgent(agent)}
            >
              <div className="reader-agent-avatar">
                <i style={{ background: agent.annotationColor }} />
                <AvatarBadge avatar={agent.avatar} />
              </div>
              <span>
                <strong>{agent.nickname}</strong>
                <em>@{agent.username}</em>
                <small>{agent.personalityName || '自定义个性'}</small>
              </span>
              <b>
                {running
                  ? '阅读中'
                  : selected && readingIntent
                    ? agentReadingIntentLabel(readingIntent)
                    : '选择'}
              </b>
            </button>
            {choosingAgentId === agent.id && !running ? (
              <div
                className="reader-agent-action-picker"
                role="radiogroup"
                aria-label={`${agent.nickname} 精读动作`}
              >
                {agentReadingIntentOptions.map((option) => (
                  <button
                    aria-checked={readingIntent === option.value}
                    className={readingIntent === option.value ? 'is-active' : ''}
                    key={option.value}
                    role="radio"
                    type="button"
                    onClick={() => setAgentReadingIntent(agent.id, option.value)}
                  >
                    <strong>{option.shortLabel}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
      <div className="reader-agent-annotate-actions">
        <button type="button" onClick={onCancel}>
          收起
        </button>
        <button disabled={selectedAgents.length === 0} type="button" onClick={startSelectedAgents}>
          开始精读
        </button>
      </div>
    </div>
  );
}

export function ReaderSettingsPanel({
  panelProps,
  desktopConnected,
  hasSavedPairing,
  pairingId,
  pairingStatus,
  pairingTokenDraft,
  settings,
  onChange,
  onDisconnectDesktop,
  onSavePairingToken,
  onSetPairingTokenDraft,
}: {
  panelProps?: React.HTMLAttributes<HTMLDivElement>;
  desktopConnected: boolean;
  hasSavedPairing: boolean;
  pairingId: string;
  pairingStatus: string;
  pairingTokenDraft: string;
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onDisconnectDesktop: () => void | Promise<void>;
  onSavePairingToken: () => void | Promise<void>;
  onSetPairingTokenDraft: (token: string) => void;
}) {
  const [pairingEditorOpen, setPairingEditorOpen] = useState(false);
  const showPairingSummary = hasSavedPairing && !pairingEditorOpen;
  const pairingConnectedClass = desktopConnected
    ? 'reader-pairing-connected'
    : 'reader-pairing-connected is-offline';
  const pairingStatusClass = desktopConnected
    ? 'reader-pairing-status is-connected'
    : 'reader-pairing-status';

  return (
    <div className="reader-settings-panel" {...panelProps}>
      <div className="reader-pairing-row">
        {showPairingSummary ? (
          <div className={pairingConnectedClass}>
            <div className="reader-pairing-connected-main">
              <span>{desktopConnected ? <Check size={15} /> : <Unplug size={15} />}</span>
              <div>
                <strong>已保存配对</strong>
                <p>{desktopConnected ? '已连接本机桌面端' : '桌面端未连通'}</p>
              </div>
            </div>
            <div className="reader-pairing-identity">
              <span>连接标识</span>
              <strong>{pairingId || '本机桌面端'}</strong>
            </div>
            <span className={pairingStatusClass}>{pairingStatus}</span>
            <div className="reader-pairing-connected-actions">
              <button type="button" onClick={() => setPairingEditorOpen(true)}>
                <KeyRound size={13} />
                更换
              </button>
              <button type="button" onClick={onDisconnectDesktop}>
                <Unplug size={13} />
                断开
              </button>
            </div>
          </div>
        ) : (
          <>
            <label htmlFor="reader-pairing-token">
              <KeyRound size={16} />
              桌面端配对码
            </label>
            <input
              id="reader-pairing-token"
              autoComplete="off"
              spellCheck={false}
              value={pairingTokenDraft}
              onChange={(event) => onSetPairingTokenDraft(event.target.value)}
            />
            <div className="reader-pairing-actions">
              <button
                type="button"
                onClick={() => {
                  setPairingEditorOpen(false);
                  void onSavePairingToken();
                }}
              >
                <Save size={13} />
                保存
              </button>
              <button
                disabled={!pairingTokenDraft && !desktopConnected}
                type="button"
                onClick={onDisconnectDesktop}
              >
                <Unplug size={13} />
                断开
              </button>
            </div>
            <span className="reader-pairing-status">{pairingStatus}</span>
          </>
        )}
      </div>
      <SettingStepper
        icon={<CaseSensitive size={17} />}
        label="字号"
        value={`${settings.fontSize}px`}
        onDecrease={() => onChange({ ...settings, fontSize: Math.max(16, settings.fontSize - 1) })}
        onIncrease={() => onChange({ ...settings, fontSize: Math.min(28, settings.fontSize + 1) })}
      />
      <SettingStepper
        icon={<Maximize2 size={16} />}
        label="文章宽度"
        value={`${settings.contentWidth}px`}
        onDecrease={() =>
          onChange({ ...settings, contentWidth: Math.max(680, settings.contentWidth - 40) })
        }
        onIncrease={() =>
          onChange({ ...settings, contentWidth: Math.min(1080, settings.contentWidth + 40) })
        }
      />
    </div>
  );
}

function SettingStepper({
  icon,
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div className="reader-setting-row">
      <div className="reader-setting-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className="reader-stepper">
        <button type="button" onClick={onDecrease} aria-label={`减少${label}`}>
          <Minus size={14} />
        </button>
        <strong>{value}</strong>
        <button type="button" onClick={onIncrease} aria-label={`增加${label}`}>
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export function Composer({
  composer,
  shortcutModifier,
  onCancel,
  onSave,
}: {
  composer: PendingComposer;
  shortcutModifier: string;
  onCancel: () => void;
  onSave: (note: string, annotationType: AnnotationType) => void;
}) {
  const [note, setNote] = useState('');
  const [annotationType, setAnnotationType] = useState<AnnotationType>('key_point');
  return (
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <header className="reader-composer-header">
        <div className="reader-composer-title-row">
          <strong>批注</strong>
          <div className="reader-shortcut-hint">
            <Kbd className="reader-kbd">{shortcutModifier}</Kbd>
            <Kbd className="reader-kbd">Enter</Kbd>
            <span>保存</span>
          </div>
        </div>
        <div
          aria-label="批注标签"
          className="reader-composer-types"
          role="radiogroup"
          onKeyDown={(event) =>
            moveAnnotationTypeSelection(event, annotationType, setAnnotationType)
          }
        >
          {annotationTypeOptions.map((type) => (
            <button
              aria-checked={annotationType === type}
              className={annotationType === type ? 'is-active' : ''}
              key={type}
              role="radio"
              tabIndex={annotationType === type ? 0 : -1}
              type="button"
              onClick={() => setAnnotationType(type)}
            >
              {annotationTypeLabel(type)}
            </button>
          ))}
        </div>
      </header>
      <textarea
        aria-label="批注内容"
        autoFocus
        placeholder="写下你的批注…"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (isSubmitShortcut(event)) {
            event.preventDefault();
            onSave(note, annotationType);
          }
        }}
      />
      <div className="reader-composer-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={() => onSave(note, annotationType)}>
          保存批注
        </button>
      </div>
    </div>
  );
}

export function AnnotationCard({
  active,
  agents,
  annotation,
  desktopConnected,
  focusRequest,
  noteRef,
  shortcutModifier,
  userProfile,
  onAddComment,
  onDelete,
  onFocus,
}: {
  active: boolean;
  agents: PublicAgent[];
  annotation: Annotation;
  desktopConnected: boolean;
  focusRequest: number;
  noteRef: (element: HTMLElement | null) => void;
  shortcutModifier: string;
  userProfile: UserProfile;
  onAddComment: (annotationId: string, content: string) => void;
  onDelete: (annotationId: string) => void;
  onFocus: (annotationId: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [deleteHolding, setDeleteHolding] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const deleteTimerRef = useRef<number | null>(null);
  const previousActiveRef = useRef(active);
  const mentionQuery = getMentionQuery(draft, caretIndex);
  const matchedAgents =
    mentionQuery === null
      ? []
      : agents
          .filter(
            (agent) =>
              agent.username.toLowerCase().startsWith(mentionQuery.query.toLowerCase()) ||
              agent.nickname.toLowerCase().includes(mentionQuery.query.toLowerCase()),
          )
          .slice(0, 5);
  const author = annotationAuthor(annotation, userProfile, agents);

  useEffect(() => {
    setSelectedMentionIndex(0);
  }, [mentionQuery?.query]);

  useEffect(() => {
    if (matchedAgents.length > 0 && selectedMentionIndex >= matchedAgents.length)
      setSelectedMentionIndex(0);
  }, [matchedAgents.length, selectedMentionIndex]);

  useEffect(() => {
    if (active && !previousActiveRef.current) setExpanded(true);
    previousActiveRef.current = active;
  }, [active]);

  useEffect(() => {
    if (active && focusRequest > 0) setExpanded(true);
  }, [active, focusRequest]);

  useEffect(() => () => stopDeleteTimer(), []);

  function submit() {
    if (draft.trim()) setExpanded(true);
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
    if (!mentionQuery) return;
    const nextDraft = replaceMentionQuery(draft, mentionQuery, agent.username);
    const nextCaretIndex = mentionQuery.start + agent.username.length + 2;
    setDraft(nextDraft);
    setCaretIndex(nextCaretIndex);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaretIndex, nextCaretIndex);
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

    if (isSubmitShortcut(event)) {
      event.preventDefault();
      submit();
    }
  }

  function handleKeyUp(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Tab' || event.key === 'ArrowDown' || event.key === 'ArrowUp') return;
    updateCaret(event.currentTarget);
  }

  return (
    <section
      className={active ? 'reader-note is-active' : 'reader-note'}
      ref={noteRef}
      style={noteStyle(author.color, active)}
    >
      <div className="reader-note-body">
        <button className="reader-note-anchor" type="button" onClick={() => onFocus(annotation.id)}>
          <span className="reader-note-persona">
            <AvatarBadge avatar={author.avatar} fallback={author.fallback} />
            <strong>{author.nickname}</strong>
            <em>@{author.username}</em>
          </span>
          {annotation.annotationType ? (
            <span className="reader-note-type">
              {annotationTypeLabel(annotation.annotationType)}
            </span>
          ) : null}
          <span className="reader-note-quote">“{annotation.anchor.exact}”</span>
        </button>
        <div className="reader-note-toolbar">
          <button
            className="reader-comment-toggle"
            type="button"
            onClick={() => setExpanded((open) => !open)}
          >
            <MessageSquare size={14} />
            {annotation.comments.length} 条评论
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
        {expanded ? (
          <>
            <div className="reader-comments">
              {annotation.comments.length === 0 ? (
                <p className="reader-muted">已高亮，暂无文字批注。</p>
              ) : null}
              {annotation.comments.map((comment) => {
                const commentAuthor = commentPersona(comment, userProfile, agents);
                return (
                  <div className="reader-comment" key={comment.id}>
                    <AvatarBadge avatar={commentAuthor.avatar} fallback={commentAuthor.fallback} />
                    <div className="reader-comment-body">
                      <div className="reader-comment-author">
                        <strong>{commentAuthor.nickname}</strong>
                        <em>@{commentAuthor.username}</em>
                        {comment.readingIntent ? (
                          <span>{agentReadingIntentLabel(comment.readingIntent)}</span>
                        ) : null}
                        {comment.questionStatus ? (
                          <span>{questionStatusLabel(comment.questionStatus)}</span>
                        ) : null}
                      </div>
                      <MarkdownContent content={comment.content} pending={comment.pending} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="reader-comment-box">
              <textarea
                aria-label="评论内容"
                autoFocus={active}
                ref={textareaRef}
                placeholder={desktopConnected ? '继续评论，输入 @ 呼叫助手…' : '继续评论…'}
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
              <div className="reader-shortcut-hint">
                <Kbd className="reader-kbd">{shortcutModifier}</Kbd>
                <Kbd className="reader-kbd">Enter</Kbd>
                <span>发送</span>
              </div>
              <button className="reader-add-comment" type="button" onClick={submit}>
                添加评论
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}

function MarkdownContent({ content, pending }: { content: string; pending?: boolean }) {
  const html = useMemo(() => renderMarkdown(content), [content]);

  return (
    <div className="reader-markdown">
      <div className="reader-markdown-content" dangerouslySetInnerHTML={{ __html: html }} />
      {pending ? <i className="reader-spinner" /> : null}
    </div>
  );
}
function isSubmitShortcut(event: React.KeyboardEvent<HTMLTextAreaElement>) {
  const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return event.key === 'Enter' && (isMac ? event.metaKey : event.ctrlKey);
}

function noteStyle(color: string, active: boolean): React.CSSProperties {
  const accent = color || '#f4c95d';
  return {
    borderColor: alphaColor(accent, active ? 0.82 : 0.38),
    boxShadow: active
      ? `0 0 0 3px ${alphaColor(accent, 0.18)}, 0 10px 34px rgba(55,42,24,.08)`
      : undefined,
  };
}

function alphaColor(color: string, alpha: number) {
  const hex = color.trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `rgba(244,201,93,${alpha})`;
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${alpha})`;
}

function isImageAvatar(value: string) {
  return (
    value.startsWith('data:image/') ||
    value.startsWith('blob:') ||
    value.startsWith('http') ||
    value.startsWith('/')
  );
}

function isSvgAvatar(value: string) {
  return value.startsWith('data:image/svg+xml') || value.endsWith('.svg');
}
