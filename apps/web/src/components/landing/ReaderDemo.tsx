import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { useCallback, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { useStableCallback } from './use-stable-callback';
import { createPortal } from 'react-dom';
import {
  getLandingContent,
  type Agent,
  type Annotation,
  type Locale,
  type Thought,
} from './data/article';

type ConnectionPath = { d: string; arrow: string; sx: number; sy: number };
type DiscussionModalPhase = 'opening' | 'open' | 'closing';

function useAgentResolver(agents: Agent[]) {
  return useCallback((id: string) => agents.find((a) => a.id === id) ?? agents[0], [agents]);
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function getCssDurationMs(variableName: string, fallback: number) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) return fallback;
  return raw.endsWith('ms') ? value : value * 1000;
}

function subscribeToNothing() {
  return () => {};
}

/** Discussion modal: idea list on the left, selected thread on the right. */
function DiscussionModal({
  annotation,
  agents,
  labels,
  returnFocusTarget,
  onClosed,
}: {
  annotation: Annotation;
  agents: Agent[];
  labels: {
    quote: string;
    ideas: string;
    discussion: (n: number) => string;
    pick: string;
    close: string;
  };
  returnFocusTarget: HTMLElement | null;
  onClosed: () => void;
}) {
  const getAgent = useAgentResolver(agents);
  const [{ phase, selected }, dispatch] = useReducer(discussionModalReducer, {
    phase: 'opening',
    selected: 0,
  });
  // Portal to <body> so the fixed overlay centers against the viewport instead
  // of the demo section, whose backdrop-filter would otherwise contain it.
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const releaseBackgroundRef = useRef<(() => void) | null>(null);

  function cancelFrame() {
    if (frameRef.current === null) return;
    window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }

  function requestClose() {
    if (phase === 'closing') return;
    cancelFrame();
    // Release the background before focus returns to it.
    releaseBackgroundRef.current?.();
    dispatch({ type: 'closeRequested' });
    returnFocusTarget?.focus({ preventScroll: true });
    const closeMs = prefersReducedMotion() ? 0 : getCssDurationMs('--modal-close-dur', 150);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClosed();
    }, closeMs);
  }

  const onEscape = useStableCallback(requestClose);

  const attachOverlay = useCallback((overlay: HTMLDivElement) => {
    const background = Array.from(document.body.children).filter(
      (el) => el !== overlay && !el.hasAttribute('inert'),
    );
    for (const el of background) el.setAttribute('inert', '');
    const releaseBackground = () => {
      for (const el of background) el.removeAttribute('inert');
      releaseBackgroundRef.current = null;
    };
    releaseBackgroundRef.current = releaseBackground;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onEscape();
    };
    window.addEventListener('keydown', onKey);

    frameRef.current = window.requestAnimationFrame(() => {
      dispatch({ type: 'opened' });
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        closeButtonRef.current?.focus({ preventScroll: true });
      });
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
      releaseBackgroundRef.current?.();
    };
  }, []);

  const thoughts: Thought[] = annotation.thoughts ?? [];
  const current = thoughts[selected];

  if (!hydrated) return null;

  return createPortal(
    <div
      className="dm-overlay"
      ref={attachOverlay}
      data-state={phase}
      aria-hidden={phase === 'closing'}
      inert={phase === 'closing' ? true : undefined}
      onClick={requestClose}
    >
      <div
        className="dm-panel"
        role="dialog"
        aria-modal="true"
        aria-label={labels.ideas}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dm-quote">
          <span className="lbl">{labels.quote}</span>
          <p>{annotation.quote}</p>
          <button
            className="dm-close"
            ref={closeButtonRef}
            type="button"
            onClick={requestClose}
            aria-label={labels.close}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>
        <div className="dm-body">
          <div className="dm-ideas">
            <div className="dm-ideas-head">
              <b>{labels.ideas}</b>
              <span className="cnt">{thoughts.length}</span>
            </div>
            <div className="dm-idea-list">
              {thoughts.map((thought, index) => {
                const author = getAgent(thought.authorId);
                return (
                  <button
                    key={thought.id}
                    type="button"
                    className={`dm-idea${index === selected ? ' sel' : ''}`}
                    onClick={() => dispatch({ type: 'thoughtSelected', index })}
                  >
                    <span className="av">
                      <img src={author.avatar} alt="" width={96} height={96} />
                    </span>
                    <div>
                      <div className="dm-idea-name">{author.nickname}</div>
                      <div className="dm-idea-txt">{thought.content}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dm-thread">
            {current ? (
              <>
                <div className="dm-root">{current.content}</div>
                <div className="dm-divider">{labels.discussion(current.comments.length)}</div>
                {current.comments.map((comment) => {
                  const me = comment.authorId === 'yomitomo';
                  const author = getAgent(comment.authorId);
                  return (
                    <div className={`dm-msg${me ? ' me' : ''}`} key={comment.id}>
                      <span className="av">
                        <img src={author.avatar} alt="" width={96} height={96} />
                      </span>
                      <div className={`dm-msg-bubble${me ? '' : ' them'}`}>
                        <div className="dm-msg-name">{author.nickname}</div>
                        <div className="dm-msg-body">{comment.content}</div>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{ color: 'var(--ink-3)', padding: '40px 0', textAlign: 'center' }}>
                {labels.pick}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** One annotation card in the rail: a distillation slip or a discussion entry. */
function Note({
  annotation,
  agents,
  active,
  labels,
  onActivate,
  onOpen,
}: {
  annotation: Annotation;
  agents: Agent[];
  active: boolean;
  labels: { distill: string; enter: string };
  onActivate: (id: string) => void;
  onOpen: (annotation: Annotation, returnFocusTarget: HTMLElement) => void;
}) {
  const getAgent = useAgentResolver(agents);

  if (annotation.type === 'distillation') {
    return (
      <div
        className={`note distill${active ? ' active' : ''}`}
        data-note={annotation.id}
        onMouseEnter={() => onActivate(annotation.id)}
      >
        <div className="note-tag">{labels.distill}</div>
        <div className="note-q">
          <span className="qmark">“</span>
          {annotation.content}
        </div>
      </div>
    );
  }

  const assistantIds = annotation.agentIds.filter((id) => id !== 'yomitomo');
  const ids = assistantIds.length > 0 ? assistantIds : annotation.agentIds;

  return (
    <div
      className={`note${active ? ' active' : ''}`}
      data-note={annotation.id}
      onMouseEnter={() => onActivate(annotation.id)}
    >
      <button
        className="note-q"
        type="button"
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          textAlign: 'left',
          cursor: 'pointer',
        }}
        onClick={() => onActivate(annotation.id)}
      >
        <span className="qmark">“</span>
        {annotation.quote}
      </button>
      <div className="note-foot">
        <span className="avatar-stack">
          {ids.map((id) => (
            <span className="av" key={id}>
              <img src={getAgent(id).avatar} alt="" width={96} height={96} />
            </span>
          ))}
        </span>
        <button
          className="note-enter"
          type="button"
          onClick={(event) => onOpen(annotation, event.currentTarget)}
        >
          <HugeiconsIcon icon={BubbleChatIcon} />
          {labels.enter}
        </button>
      </div>
    </div>
  );
}

export default function ReaderDemo({ lang = 'zh-CN' }: { lang?: Locale }) {
  const content = useMemo(() => getLandingContent(lang), [lang]);
  const { paragraphs, annotations, agents, meta, ui } = content;
  const isEnglish = lang === 'en';
  const isJapanese = lang === 'ja';

  const [{ active, modal, path }, dispatch] = useReducer(readerDemoReducer, {
    active: null,
    modal: null,
    path: null,
  });
  // Recreated when the active note changes, so the path is measured after that commit.
  const attachReader = useCallback(
    (root: HTMLDivElement) => {
      const measure = () =>
        dispatch({ type: 'pathMeasured', path: connectionPath(root, active, annotations) });
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    },
    [active, annotations],
  );

  const modalLabels = {
    quote: ui.quoteLabel,
    ideas: ui.ideasLabel,
    discussion: (n: number) => `${ui.discussionLabel} · ${ui.replies(n)}`,
    pick: ui.selectThought,
    close: ui.closeLabel,
  };
  const noteLabels = {
    distill: isEnglish
      ? 'Distilled · a conclusion to keep'
      : isJapanese
        ? 'まとめ · 残す価値のある結論'
        : '沉淀 · 可保留的结论',
    enter: ui.enterDiscussion,
  };
  const windowTitle = isEnglish
    ? 'About Yomitomo · Reading'
    : isJapanese
      ? 'Yomitomoについて · 読書中'
      : '关于 Yomitomo · 阅读中';
  const activateNote = useCallback((id: string) => dispatch({ type: 'noteActivated', id }), []);
  const openDiscussionModal = useCallback(
    (annotation: Annotation, returnFocusTarget: HTMLElement) =>
      dispatch({ type: 'discussionOpened', annotation, returnFocusTarget }),
    [],
  );
  const handleModalClosed = useCallback(() => dispatch({ type: 'discussionClosed' }), []);

  return (
    <div className="win">
      <div className="win-bar">
        <div className="win-lights">
          <i />
          <i />
          <i />
        </div>
        <div className="win-title">
          <span className="dot" />
          {windowTitle}
        </div>
        <div className="win-spacer" />
      </div>
      <div className="reader" ref={attachReader}>
        <svg className="reader-svg">
          <defs>
            <filter id="rdRough" x="-25%" y="-25%" width="150%" height="150%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.022"
                numOctaves={2}
                seed={7}
                result="n"
              />
              <feDisplacementMap
                in="SourceGraphic"
                in2="n"
                scale={2.8}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </defs>
          {path && (
            <g filter="url(#rdRough)">
              <path d={path.d} />
              <path d={path.arrow} className="arrow" />
              <circle cx={path.sx} cy={path.sy} r={3.4} className="startdot" />
            </g>
          )}
        </svg>
        <div className="reader-prose">
          <p className="reader-eyebrow">{ui.eyebrow}</p>
          <h2 className="reader-title">{meta.title}</h2>
          <div className="reader-meta">
            <b>{meta.byline}</b>
            <span className="sep">·</span>
            <span>{meta.date}</span>
            <span className="sep">·</span>
            <span>{meta.readingTime}</span>
          </div>
          <div className="reader-body">
            {paragraphs.map((paragraph) => (
              <p key={paragraph.id}>
                {paragraph.segments.map((segment, index) =>
                  segment.type === 'highlight' ? (
                    <span
                      key={index}
                      className={`hl${active === segment.annotationId ? ' active' : ''}`}
                      data-ann={segment.annotationId}
                      onClick={() =>
                        dispatch({ type: 'highlightToggled', id: segment.annotationId })
                      }
                    >
                      {segment.content}
                    </span>
                  ) : (
                    <span key={index}>{segment.content}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        </div>
        <div className="reader-rail">
          <div className="rail-head">{ui.railHeader}</div>
          {annotations.map((annotation) => (
            <Note
              key={annotation.id}
              annotation={annotation}
              agents={agents}
              active={active === annotation.id}
              labels={noteLabels}
              onActivate={activateNote}
              onOpen={openDiscussionModal}
            />
          ))}
        </div>
      </div>
      {modal ? (
        <DiscussionModal
          key={modal.annotation.id}
          annotation={modal.annotation}
          agents={agents}
          labels={modalLabels}
          returnFocusTarget={modal.returnFocusTarget}
          onClosed={handleModalClosed}
        />
      ) : null}
    </div>
  );
}

type DiscussionModalState = { phase: DiscussionModalPhase; selected: number };

type DiscussionModalEvent =
  | { type: 'closeRequested' }
  | { type: 'opened' }
  | { type: 'thoughtSelected'; index: number };

function discussionModalReducer(
  state: DiscussionModalState,
  event: DiscussionModalEvent,
): DiscussionModalState {
  switch (event.type) {
    case 'closeRequested':
      return { ...state, phase: 'closing' };
    case 'opened':
      return state.phase === 'opening' ? { ...state, phase: 'open' } : state;
    case 'thoughtSelected':
      return { ...state, selected: event.index };
  }
}

type ReaderDemoState = {
  active: string | null;
  modal: { annotation: Annotation; returnFocusTarget: HTMLElement } | null;
  path: ConnectionPath | null;
};

type ReaderDemoEvent =
  | { type: 'discussionClosed' }
  | { type: 'discussionOpened'; annotation: Annotation; returnFocusTarget: HTMLElement }
  | { type: 'highlightToggled'; id: string }
  | { type: 'noteActivated'; id: string }
  | { type: 'pathMeasured'; path: ConnectionPath | null };

function readerDemoReducer(state: ReaderDemoState, event: ReaderDemoEvent): ReaderDemoState {
  switch (event.type) {
    case 'discussionClosed':
      return { ...state, modal: null };
    case 'discussionOpened':
      return {
        ...state,
        modal: { annotation: event.annotation, returnFocusTarget: event.returnFocusTarget },
      };
    case 'highlightToggled':
      return { ...state, active: state.active === event.id ? null : event.id };
    case 'noteActivated':
      return { ...state, active: event.id };
    case 'pathMeasured':
      return { ...state, path: event.path };
  }
}

function connectionPath(
  root: HTMLElement,
  active: string | null,
  annotations: Annotation[],
): ConnectionPath | null {
  if (!active) return null;
  const noteEl = root.querySelector<HTMLElement>(`[data-note="${active}"]`);
  if (!noteEl) return null;
  // Distillation cards point back to the highlight they reuse.
  const annObj = annotations.find((n) => n.id === active);
  const srcId = annObj?.highlightId ?? active;
  const hlEls = root.querySelectorAll<HTMLElement>(`[data-ann="${srcId}"]`);
  if (!hlEls.length) return null;
  const rr = root.getBoundingClientRect();
  const b = noteEl.getBoundingClientRect();
  const ty = b.top - rr.top + Math.min(30, b.height / 2);
  const tipX = b.left - rr.left - 2;
  let best = hlEls[0];
  let bestD = Infinity;
  hlEls.forEach((el) => {
    const r = el.getBoundingClientRect();
    const cy = r.top - rr.top + r.height / 2;
    const d = Math.abs(cy - ty);
    if (d < bestD) {
      bestD = d;
      best = el;
    }
  });
  const a = best.getBoundingClientRect();
  const x1 = a.right - rr.left;
  const y1 = a.top - rr.top + a.height / 2;
  const cx = (x1 + tipX) / 2;
  const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${ty}, ${tipX} ${ty}`;
  const arrow = `M ${tipX - 9} ${ty - 5} L ${tipX} ${ty} L ${tipX - 9} ${ty + 5}`;
  return { d, arrow, sx: x1, sy: y1 };
}
