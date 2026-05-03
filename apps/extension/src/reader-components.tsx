import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Maximize2,
  MessageSquare,
  MessageSquarePlus,
  Minus,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Annotation, PublicAgent, UserProfile } from '@yomitomo/shared';
import { renderMarkdown } from '@yomitomo/shared';
import {
  annotationPersona as annotationAuthor,
  annotationTypeLabel,
  commentPersona,
  getMentionQuery,
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

const DELETE_HOLD_MS = 1600;
export function SelectionMenu({
  action,
  onAnnotate,
}: {
  action: SelectionMenuAction;
  onAnnotate: () => void;
}) {
  return (
    <div className="reader-selection-menu" style={{ left: action.x, top: action.y }}>
      <button type="button" onClick={onAnnotate}>
        <MessageSquarePlus size={15} strokeWidth={2.2} />
        批注
      </button>
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

export function AgentAnnotateMenu({
  agents,
  annotatingAgents,
  onCancel,
  onStartAgent,
  onStartAll,
}: {
  agents: PublicAgent[];
  annotatingAgents: string[];
  onCancel: () => void;
  onStartAgent: (agent: PublicAgent) => void;
  onStartAll: () => void;
}) {
  const runnableCount = agents.filter((agent) => !annotatingAgents.includes(agent.id)).length;
  return (
    <div className="reader-agent-annotate-menu">
      <header>
        <strong>助手精读</strong>
        <span>选择阅读助手开始主动批注</span>
      </header>
      {agents.map((agent) => (
        <button
          className={annotatingAgents.includes(agent.id) ? 'is-running' : ''}
          disabled={annotatingAgents.includes(agent.id)}
          key={agent.id}
          type="button"
          onClick={() => onStartAgent(agent)}
        >
          <AvatarBadge avatar={agent.avatar} />
          <span>
            <strong>{agent.nickname}</strong>
            <em>@{agent.username}</em>
          </span>
          <b>{annotatingAgents.includes(agent.id) ? '阅读中' : '开始'}</b>
        </button>
      ))}
      <div className="reader-agent-annotate-actions">
        <button type="button" onClick={onCancel}>
          收起
        </button>
        <button disabled={runnableCount === 0} type="button" onClick={onStartAll}>
          全部启动{runnableCount > 0 ? ` ${runnableCount}` : ''}
        </button>
      </div>
    </div>
  );
}

export function ReaderSettingsPanel({
  settings,
  onChange,
}: {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
}) {
  return (
    <div className="reader-settings-panel">
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
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <div className="reader-composer" style={{ left: composer.x, top: composer.y }}>
      <textarea
        autoFocus
        placeholder="写下你的批注..."
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onKeyDown={(event) => {
          if (isSubmitShortcut(event)) {
            event.preventDefault();
            onSave(note);
          }
        }}
      />
      <div className="reader-composer-actions">
        <div className="reader-shortcut-hint">
          <Kbd className="reader-kbd">{shortcutModifier}</Kbd>
          <Kbd className="reader-kbd">Enter</Kbd>
          <span>保存</span>
        </div>
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={() => onSave(note)}>
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
                      </div>
                      <MarkdownContent content={comment.content} pending={comment.pending} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="reader-comment-box">
              <textarea
                autoFocus={active}
                ref={textareaRef}
                placeholder={desktopConnected ? '继续评论，输入 @ 呼叫助手...' : '继续评论...'}
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
