import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  Loading03Icon,
  MessageQuestionIcon,
  MinusSignIcon,
  SentIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons';
import React, { useCallback, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { renderSafeMarkdown } from '@yomitomo/core/safe-markdown';
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
import { useInterval } from '../hooks/use-interval';
import { useMountEffect } from '../hooks/use-mount-effect';
import type { ReaderChatActivationSource, ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';

const CHAT_MAX_TEXTAREA_ROWS = 8;
const CHAT_DEFAULT_SIZE = { width: 410, height: 640 };
const CHAT_MIN_SIZE = { width: 320, height: 360 };
const CHAT_PANEL_EXIT_MS = 150;
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

type ReaderChatPanelState = {
  activationSource: ReaderChatActivationSource;
  draft: string;
  layout: ReaderChatPanelLayout;
  open: boolean;
  panelPhase: ReaderChatPanelPhase;
  panelVisible: boolean;
  resizeFeedback: ReaderChatResizeFeedback;
  resizing: boolean;
};

type ReaderChatPanelEvent =
  | { type: 'chatToggled'; open: boolean; source: ReaderChatActivationSource }
  | { type: 'closeFinished' }
  | { type: 'draftChanged'; draft: string }
  | { type: 'draftSubmitted' }
  | { type: 'openFrameShown' }
  | { type: 'resizeEnded' }
  | { type: 'resizeStarted' }
  | { type: 'resized'; feedback: ReaderChatResizeFeedback; size: ReaderChatPanelSize };

const restingResizeFeedback: ReaderChatResizeFeedback = { scaleX: 1, scaleY: 1 };

function readerChatPanelReducer(
  state: ReaderChatPanelState,
  event: ReaderChatPanelEvent,
): ReaderChatPanelState {
  switch (event.type) {
    case 'chatToggled': {
      const next = { ...state, activationSource: event.source, open: event.open };
      if (event.source === 'keyboard') {
        return { ...next, panelPhase: event.open ? 'open' : 'closing', panelVisible: event.open };
      }
      if (event.open) return { ...next, panelPhase: 'opening', panelVisible: true };
      return state.panelVisible ? { ...next, panelPhase: 'closing' } : next;
    }
    case 'closeFinished':
      return state.panelPhase === 'closing' ? { ...state, panelVisible: false } : state;
    case 'draftChanged':
      return { ...state, draft: event.draft };
    case 'draftSubmitted':
      return { ...state, draft: '' };
    case 'openFrameShown':
      return state.panelPhase === 'opening' ? { ...state, panelPhase: 'open' } : state;
    case 'resizeEnded':
      return { ...state, resizeFeedback: restingResizeFeedback, resizing: false };
    case 'resizeStarted':
      return { ...state, resizing: true };
    case 'resized':
      return {
        ...state,
        layout: { mode: 'custom', size: event.size },
        resizeFeedback: event.feedback,
      };
  }
}

function initialReaderChatPanelState({
  activationSource,
  open,
}: {
  activationSource: ReaderChatActivationSource;
  open: boolean;
}): ReaderChatPanelState {
  return readerChatPanelReducer(
    {
      activationSource,
      draft: '',
      layout: { mode: 'default' },
      open,
      panelPhase: open ? 'open' : 'closing',
      panelVisible: open,
      resizeFeedback: restingResizeFeedback,
      resizing: false,
    },
    { type: 'chatToggled', open, source: activationSource },
  );
}

type ReaderChatMessageLabels = Pick<
  ReaderUiLabels,
  | 'assistant'
  | 'assistantAnswering'
  | 'assistantToolStep'
  | 'dateLocale'
  | 'me'
  | 'relativeTimeLabel'
>;

type ReaderChatPanelLabels = ReaderChatMessageLabels &
  Pick<
    ReaderUiLabels,
    | 'collapseReaderChat'
    | 'currentSelection'
    | 'openReaderChat'
    | 'readerChat'
    | 'readerChatAria'
    | 'readerChatAssistantPicker'
    | 'readerChatClearQuote'
    | 'readerChatContent'
    | 'readerChatEmpty'
    | 'readerChatPlaceholder'
    | 'readerChatSelectionPlaceholder'
    | 'send'
    | 'sending'
  >;

export type ReaderChatPanelProps = {
  activationSource?: ReaderChatActivationSource;
  agents: PublicAgent[];
  draftContext?: ReaderQuestionContext;
  error?: string;
  labels?: ReaderChatPanelLabels;
  messageSendShortcut: MessageSendShortcut;
  open: boolean;
  selectedAssistantId?: string;
  sending?: boolean;
  shortcutModifier: string;
  state?: ReaderChatState;
  onClearDraftContext?: () => void;
  onClose: (source: ReaderChatActivationSource) => void;
  onOpen: (source: ReaderChatActivationSource) => void;
  onOpenReference?: (href: string) => boolean;
  onRevealContext?: (context: ReaderQuestionContext) => void | Promise<void>;
  onSelectAssistant?: (assistantId: string) => void;
  onSubmit: (content: string) => void | Promise<void>;
};

export function ReaderChatPanel({
  activationSource = 'pointer',
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
  onOpenReference,
  onRevealContext,
  onSelectAssistant,
  onSubmit,
}: ReaderChatPanelProps) {
  const [chatState, dispatch] = useReducer(
    readerChatPanelReducer,
    { activationSource, open },
    initialReaderChatPanelState,
  );
  if (chatState.open !== open || chatState.activationSource !== activationSource) {
    dispatch({ type: 'chatToggled', open, source: activationSource });
  }
  const { draft, layout, panelPhase, panelVisible, resizeFeedback, resizing } = chatState;
  const renderPanel = open || (activationSource === 'pointer' && panelVisible);
  const viewport = useReaderChatViewport(renderPanel);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeSession = useMemo(
    () => state?.sessions.find((session) => session.id === state.activeSessionId),
    [state],
  );
  const selectedAssistant =
    agents.find((agent) => agent.id === selectedAssistantId) || agents[0] || null;
  const panelSize = readerChatPanelSize(layout, viewport);

  useInterval(
    () => dispatch({ type: 'closeFinished' }),
    panelVisible && panelPhase === 'closing' ? CHAT_PANEL_EXIT_MS : null,
  );

  useMountEffect(() => () => resizeCleanupRef.current?.());

  const messageScrollKey = activeSession
    ? activeSession.messages.map((message) => `${message.id}:${message.content.length}`).join('|')
    : '';
  const streamingAssistantMessageId =
    sending && activeSession?.messages.at(-1)?.role === 'assistant'
      ? activeSession.messages.at(-1)?.id
      : undefined;

  // Recreated when the draft, open state or quote changes, so the textarea is resized after that commit.
  const attachTextarea = useCallback(
    (textarea: HTMLTextAreaElement) => {
      textareaRef.current = textarea;
      resizeTextarea(textarea);
      return () => {
        textareaRef.current = null;
      };
    },
    [draft, open, draftContext],
  );

  // Recreated when the phase, open state or quote changes, so motion and focus follow that commit.
  const attachPanel = useCallback(() => {
    const frame =
      panelPhase === 'opening'
        ? window.requestAnimationFrame(() => dispatch({ type: 'openFrameShown' }))
        : 0;
    if (open) textareaRef.current?.focus({ preventScroll: true });
    return () => window.cancelAnimationFrame(frame);
  }, [panelPhase, open, draftContext]);

  // Recreated when messages, errors or the open state change, so the list scrolls to the end after that commit.
  const attachMessages = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element || !open) return;
      if (typeof element.scrollTo === 'function') {
        element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
      } else {
        element.scrollTop = element.scrollHeight;
      }
    },
    [error, messageScrollKey, open],
  );

  async function submit() {
    const content = draft.trim();
    if (!content || sending || !selectedAssistant) return;
    dispatch({ type: 'draftSubmitted' });
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
    dispatch({ type: 'draftChanged', draft: event.currentTarget.value });
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
    const startSize = panelSize;
    resizeCleanupRef.current?.();
    dispatch({ type: 'resizeStarted' });

    function cleanupResize() {
      handle.releasePointerCapture?.(pointerId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      dispatch({ type: 'resizeEnded' });
      if (resizeCleanupRef.current === cleanupResize) resizeCleanupRef.current = null;
    }

    function handlePointerMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();

      const width = startSize.width + (edges.left ? startX - moveEvent.clientX : 0);
      const height = startSize.height + (edges.top ? startY - moveEvent.clientY : 0);
      const widthDelta = width - startSize.width;
      const heightDelta = height - startSize.height;
      dispatch({
        type: 'resized',
        feedback: {
          scaleX: 1 + clampNumber(widthDelta / 5200, -0.008, 0.014),
          scaleY: 1 + clampNumber(heightDelta / 5600, -0.008, 0.014),
        },
        size: clampReaderChatPanelSize({ width, height }, currentReaderChatViewport()),
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

  const returningToFab =
    activationSource === 'pointer' && !open && panelVisible && panelPhase === 'closing';
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
        onClick={() => onOpen('pointer')}
      >
        <HugeiconsIcon icon={MessageQuestionIcon} size={20} strokeWidth={2.15} />
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
  const panelClassName = [
    'reader-chat-panel',
    `is-${panelPhase}`,
    layout.mode === 'custom' ? 'is-custom' : '',
    resizing ? 'is-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {minimizedButton}
      <section
        ref={attachPanel}
        className={panelClassName}
        data-open={open ? 'true' : 'false'}
        data-activation-source={activationSource}
        data-state={panelPhase}
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
              <button
                type="button"
                aria-label={labels.collapseReaderChat}
                onClick={() => onClose('pointer')}
              >
                <HugeiconsIcon icon={MinusSignIcon} size={16} />
              </button>
            </ReaderTooltip>
          </div>
        </header>

        <div className="reader-chat-messages" ref={attachMessages}>
          {activeSession?.messages.length ? (
            activeSession.messages.map((message) => (
              <ReaderChatMessageView
                agents={agents}
                key={message.id}
                labels={labels}
                message={message}
                streaming={message.id === streamingAssistantMessageId}
                onOpenReference={onOpenReference}
                onRevealContext={onRevealContext}
              />
            ))
          ) : (
            <div className="reader-chat-empty">{labels.readerChatEmpty}</div>
          )}
          {error ? <div className="reader-chat-error">{error}</div> : null}
        </div>

        <FloatingComposer
          ref={attachTextarea}
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
          submitIcon={<HugeiconsIcon icon={SentIcon} size={15} />}
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
  onOpenReference,
  onRevealContext,
}: {
  agents: PublicAgent[];
  labels?: ReaderChatMessageLabels;
  message: ReaderChatMessage;
  streaming?: boolean;
  onOpenReference?: (href: string) => boolean;
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
        {isAssistant && message.assistantProgress?.steps.length ? (
          <ol className="reader-chat-message-steps">
            {message.assistantProgress.steps.map((step) => (
              <li className={`is-${step.status}`} key={step.id}>
                <HugeiconsIcon
                  icon={
                    step.status === 'done'
                      ? Tick01Icon
                      : step.status === 'failed'
                        ? Cancel01Icon
                        : Loading03Icon
                  }
                  size={10}
                />
                <span>{labels.assistantToolStep(step.label)}</span>
              </li>
            ))}
          </ol>
        ) : null}
        {isAssistant && streaming ? (
          <p>{message.content || labels.assistantAnswering}</p>
        ) : isAssistant ? (
          <div
            className="reader-chat-markdown"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={(event) => {
              const link =
                event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
              const href = link?.getAttribute('href');
              if (href && onOpenReference?.(href)) event.preventDefault();
            }}
          />
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

const serverReaderChatViewport: ReaderChatViewport = { width: 1024, height: 768 };
let cachedReaderChatViewport = serverReaderChatViewport;

function useReaderChatViewport(active: boolean) {
  return useSyncExternalStore(
    active ? subscribeToViewportResize : subscribeToNothing,
    readReaderChatViewport,
    () => serverReaderChatViewport,
  );
}

function subscribeToViewportResize(onChange: () => void) {
  window.addEventListener('resize', onChange);
  return () => window.removeEventListener('resize', onChange);
}

function subscribeToNothing() {
  return () => {};
}

// useSyncExternalStore needs a stable snapshot until the viewport size actually changes.
function readReaderChatViewport() {
  const { width, height } = currentReaderChatViewport();
  if (cachedReaderChatViewport.width !== width || cachedReaderChatViewport.height !== height) {
    cachedReaderChatViewport = { width, height };
  }
  return cachedReaderChatViewport;
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
