import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircleQuestion, Minus, Send } from 'lucide-react';
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
  ShortcutTooltipContent,
  SubmitShortcutTooltipContent,
} from '../shared/reader-component-primitives';
import { FloatingComposer } from '../shared/floating-composer';
import { formatRelativeTime, formatTime } from '../reader-date-utils';
import { useCompositionSubmit } from '../use-composition-submit';
import type { ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

const CHAT_MAX_TEXTAREA_ROWS = 8;
const CHAT_DEFAULT_SIZE = { width: 410, height: 640 };
const CHAT_MIN_SIZE = { width: 320, height: 360 };
const CHAT_PANEL_ANIMATION_MS = 250;
const CHAT_VIEWPORT_GUTTER = { width: 32, height: 112 };

type ReaderChatPanelMode = 'default' | 'custom';
type ReaderChatPanelSize = {
  width: number;
  height: number;
};
type ReaderChatPanelLayout = {
  mode: ReaderChatPanelMode;
  size?: ReaderChatPanelSize;
};
type ReaderChatPanelStyle = React.CSSProperties & {
  '--reader-chat-panel-height': string;
  '--reader-chat-resize-scale-x': string;
  '--reader-chat-resize-scale-y': string;
  '--reader-chat-panel-width': string;
};
type ReaderChatPanelPhase = 'closing' | 'open' | 'opening';
type ReaderChatResizeFeedback = {
  scaleX: number;
  scaleY: number;
};
type ReaderChatResizeEdges = {
  left?: boolean;
  top?: boolean;
};
type ReaderChatViewport = {
  width: number;
  height: number;
};

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
  const [layout, setLayout] = useState<ReaderChatPanelLayout>({ mode: 'default' });
  const [panelVisible, setPanelVisible] = useState(open);
  const [panelPhase, setPanelPhase] = useState<ReaderChatPanelPhase>(open ? 'open' : 'closing');
  const [resizing, setResizing] = useState(false);
  const [resizeFeedback, setResizeFeedback] = useState<ReaderChatResizeFeedback>({
    scaleX: 1,
    scaleY: 1,
  });
  const renderPanel = open || panelVisible;
  const viewport = useReaderChatViewport(renderPanel);
  const closeTimerRef = useRef<number | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const openFrameRef = useRef(0);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
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

  useLayoutEffect(() => {
    if (!open) return;
    textareaRef.current?.focus({ preventScroll: true });
  }, [draftContext, open]);

  const panelSize = readerChatPanelSize(layout, viewport);
  const panelSizeRef = useRef(panelSize);
  panelSizeRef.current = panelSize;

  React.useEffect(() => {
    const clearAnimationWork = () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      window.cancelAnimationFrame(openFrameRef.current);
      openFrameRef.current = 0;
    };

    clearAnimationWork();
    if (open) {
      setPanelVisible(true);
      setPanelPhase('opening');
      openFrameRef.current = window.requestAnimationFrame(() => {
        setPanelPhase('open');
      });
      return clearAnimationWork;
    }
    if (!panelVisible) return clearAnimationWork;

    setPanelPhase('closing');
    closeTimerRef.current = window.setTimeout(() => {
      setPanelVisible(false);
      closeTimerRef.current = null;
    }, CHAT_PANEL_ANIMATION_MS);
    return clearAnimationWork;
  }, [open, panelVisible]);

  useLayoutEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      window.cancelAnimationFrame(openFrameRef.current);
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
    },
    [],
  );

  const messageScrollKey = activeSession
    ? activeSession.messages.map((message) => `${message.id}:${message.content.length}`).join('|')
    : '';
  const streamingAssistantMessageId =
    sending && activeSession?.messages.at(-1)?.role === 'assistant'
      ? activeSession.messages.at(-1)?.id
      : undefined;

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

  const handleKeyDown = useCompositionSubmit({
    messageSendShortcut,
    onSubmit: () => void submit(),
  });

  function selectAssistant(agent: PublicAgent) {
    onSelectAssistant?.(agent.id);
  }

  function handleDraftChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.currentTarget.value);
    resizeTextarea(event.currentTarget);
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>, edges: ReaderChatResizeEdges) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    handle.setPointerCapture?.(pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = panelSizeRef.current;
    resizeCleanupRef.current?.();
    setResizing(true);

    function cleanupResize() {
      handle.releasePointerCapture?.(pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      setResizing(false);
      setResizeFeedback({ scaleX: 1, scaleY: 1 });
      if (resizeCleanupRef.current === cleanupResize) resizeCleanupRef.current = null;
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();

      const width = startSize.width + (edges.left ? startX - moveEvent.clientX : 0);
      const height = startSize.height + (edges.top ? startY - moveEvent.clientY : 0);
      const widthDelta = width - startSize.width;
      const heightDelta = height - startSize.height;
      setLayout({
        mode: 'custom',
        size: clampReaderChatPanelSize({ width, height }, currentReaderChatViewport()),
      });
      setResizeFeedback({
        scaleX: 1 + clampNumber(widthDelta / 5200, -0.008, 0.014),
        scaleY: 1 + clampNumber(heightDelta / 5600, -0.008, 0.014),
      });
    }

    function handlePointerUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) return;
      cleanupResize();
    }

    resizeCleanupRef.current = cleanupResize;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  const returningToFab = !open && panelVisible && panelPhase === 'closing';
  const minimizedButtonClassName = ['reader-chat-fab', returningToFab ? 'is-returning' : '']
    .filter(Boolean)
    .join(' ');
  const minimizedButton = !open ? (
    <ReaderTooltip
      content={<ShortcutTooltipContent keys={['Q']} label={labels.openReaderChat} />}
      side="top"
    >
      <button
        className={minimizedButtonClassName}
        type="button"
        aria-label={labels.openReaderChat}
        aria-expanded={false}
        onClick={onOpen}
      >
        <MessageCircleQuestion size={20} strokeWidth={2.15} />
        <span className="reader-chat-fab-shortcut" aria-hidden="true">
          Q
        </span>
      </button>
    </ReaderTooltip>
  ) : null;

  if (!renderPanel) return minimizedButton;

  const panelStyle: ReaderChatPanelStyle = {
    '--reader-chat-panel-height': `${panelSize.height}px`,
    '--reader-chat-resize-scale-x': resizeFeedback.scaleX.toFixed(4),
    '--reader-chat-resize-scale-y': resizeFeedback.scaleY.toFixed(4),
    '--reader-chat-panel-width': `${panelSize.width}px`,
  };
  const effectivePanelPhase = open && panelPhase === 'closing' ? 'opening' : panelPhase;
  const panelClassName = [
    'reader-chat-panel',
    `is-${effectivePanelPhase}`,
    layout.mode === 'custom' ? 'is-custom' : '',
    resizing ? 'is-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {minimizedButton}
      <section
        className={panelClassName}
        data-open={open ? 'true' : 'false'}
        data-state={effectivePanelPhase}
        style={panelStyle}
        aria-label={labels.readerChatAria}
      >
        <div
          className="reader-chat-resize-handle is-top-left"
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, { left: true, top: true })}
        />
        <div
          className="reader-chat-resize-handle is-top"
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, { top: true })}
        />
        <div
          className="reader-chat-resize-handle is-left"
          aria-hidden="true"
          onPointerDown={(event) => startResize(event, { left: true })}
        />
        <header className="reader-chat-header">
          <div>
            <strong>{labels.readerChat}</strong>
          </div>
          <div className="reader-chat-header-actions">
            <ReaderTooltip
              content={<ShortcutTooltipContent keys={['Q']} label={labels.collapseReaderChat} />}
              side="left"
            >
              <button type="button" aria-label={labels.collapseReaderChat} onClick={onClose}>
                <Minus size={16} />
              </button>
            </ReaderTooltip>
          </div>
        </header>

        <div className="reader-chat-messages" ref={messagesRef}>
          {activeSession?.messages.length ? (
            activeSession.messages.map((message) => (
              <ReaderChatMessageView
                agents={agents}
                key={message.id}
                labels={labels}
                message={message}
                streaming={message.id === streamingAssistantMessageId}
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
    </>
  );
}

function ReaderChatMessageView({
  agents,
  labels = defaultReaderUiLabels,
  message,
  streaming = false,
  onRevealContext,
}: {
  agents: PublicAgent[];
  labels?: ReaderUiLabels;
  message: ReaderChatMessage;
  streaming?: boolean;
  onRevealContext?: (context: ReaderQuestionContext) => void | Promise<void>;
}) {
  const isAssistant = message.role === 'assistant';
  const assistant = isAssistant
    ? agents.find((agent) => agent.id === message.assistantId) || null
    : null;
  const nickname = isAssistant ? assistant?.nickname || labels.assistant : labels.me;
  const avatar = isAssistant ? assistant?.avatar : undefined;
  const fallback = nickname.slice(0, 1) || (isAssistant ? labels.assistant.slice(0, 1) : labels.me);
  const html = useMemo(
    () => (isAssistant ? renderSafeMarkdown(message.content || labels.assistantAnswering) : ''),
    [isAssistant, labels.assistantAnswering, message.content],
  );

  return (
    <article className={`reader-chat-message is-${message.role}`}>
      {isAssistant ? <AvatarBadge avatar={avatar} fallback={fallback} /> : null}
      <div className="reader-chat-message-bubble">
        <header>
          {isAssistant ? <strong>{nickname}</strong> : <span aria-hidden="true" />}
          <ReaderTooltip content={formatTime(message.createdAt, labels)}>
            <time dateTime={message.createdAt} tabIndex={0}>
              {formatRelativeTime(message.createdAt, labels)}
            </time>
          </ReaderTooltip>
        </header>
        {!isAssistant && message.context ? (
          <button
            className="reader-chat-message-context"
            type="button"
            disabled={!message.context.anchor || !onRevealContext}
            onClick={() => void onRevealContext?.(message.context!)}
          >
            {message.context.quote}
          </button>
        ) : null}
        {isAssistant && streaming ? (
          <p>{message.content || labels.assistantAnswering}</p>
        ) : isAssistant ? (
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

function useReaderChatViewport(open: boolean) {
  const [viewport, setViewport] = useState<ReaderChatViewport>(() => currentReaderChatViewport());

  useLayoutEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const updateViewport = () => setViewport(currentReaderChatViewport());
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, [open]);

  return viewport;
}

function readerChatPanelSize(layout: ReaderChatPanelLayout, viewport: ReaderChatViewport) {
  if (layout.mode === 'custom' && layout.size) {
    return clampReaderChatPanelSize(layout.size, viewport);
  }
  return clampReaderChatPanelSize(CHAT_DEFAULT_SIZE, viewport);
}

function clampReaderChatPanelSize(size: ReaderChatPanelSize, viewport: ReaderChatViewport) {
  const maxWidth = Math.max(1, viewport.width - CHAT_VIEWPORT_GUTTER.width);
  const maxHeight = Math.max(1, viewport.height - CHAT_VIEWPORT_GUTTER.height);
  const minWidth = Math.min(CHAT_MIN_SIZE.width, maxWidth);
  const minHeight = Math.min(CHAT_MIN_SIZE.height, maxHeight);

  return {
    width: Math.round(Math.min(Math.max(size.width, minWidth), maxWidth)),
    height: Math.round(Math.min(Math.max(size.height, minHeight), maxHeight)),
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function currentReaderChatViewport(): ReaderChatViewport {
  if (typeof window === 'undefined') {
    return { width: 1024, height: 768 };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}
