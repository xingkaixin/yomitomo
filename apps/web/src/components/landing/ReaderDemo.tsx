import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircle, X } from 'lucide-react';
import {
  getLandingContent,
  type Agent,
  type Annotation,
  type Locale,
  type Thought,
} from './data/article';

type ConnectionPath = { d: string; arrow: string; sx: number; sy: number };

function useAgentResolver(agents: Agent[]) {
  return useCallback((id: string) => agents.find((a) => a.id === id) ?? agents[0], [agents]);
}

/** Discussion modal: idea list on the left, selected thread on the right. */
function DiscussionModal({
  annotation,
  agents,
  labels,
  onClose,
}: {
  annotation: Annotation | null;
  agents: Agent[];
  labels: { quote: string; ideas: string; discussion: (n: number) => string; pick: string };
  onClose: () => void;
}) {
  const getAgent = useAgentResolver(agents);
  const [selected, setSelected] = useState(0);
  // Portal to <body> so the fixed overlay centers against the viewport instead
  // of the demo section, whose backdrop-filter would otherwise contain it.
  const [mounted, setMounted] = useState(false);
  const open = !!annotation;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [annotation?.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const thoughts: Thought[] = annotation?.thoughts ?? [];
  const current = thoughts[selected];

  if (!mounted) return null;

  return createPortal(
    <div className={`dm-overlay${open ? ' open' : ''}`} onClick={onClose}>
      <div className="dm-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dm-quote">
          <span className="lbl">{labels.quote}</span>
          <p>{annotation?.quote ?? ''}</p>
          <button className="dm-close" type="button" onClick={onClose} aria-label="关闭">
            <X size={16} />
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
                    onClick={() => setSelected(index)}
                  >
                    <span className="av">
                      <img src={author.avatar} alt="" />
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
                        <img src={author.avatar} alt="" />
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
  onOpen: (annotation: Annotation) => void;
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
              <img src={getAgent(id).avatar} alt="" />
            </span>
          ))}
        </span>
        <button className="note-enter" type="button" onClick={() => onOpen(annotation)}>
          <MessageCircle />
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

  const [active, setActive] = useState<string | null>(null);
  const [modal, setModal] = useState<Annotation | null>(null);
  const [path, setPath] = useState<ConnectionPath | null>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  const draw = useCallback(() => {
    const root = readerRef.current;
    if (!root || !active) {
      setPath(null);
      return;
    }
    const noteEl = root.querySelector<HTMLElement>(`[data-note="${active}"]`);
    if (!noteEl) {
      setPath(null);
      return;
    }
    // Distillation cards point back to the highlight they reuse.
    const annObj = annotations.find((n) => n.id === active);
    const srcId = annObj?.highlightId ?? active;
    const hlEls = root.querySelectorAll<HTMLElement>(`[data-ann="${srcId}"]`);
    if (!hlEls.length) {
      setPath(null);
      return;
    }
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
    setPath({ d, arrow, sx: x1, sy: y1 });
  }, [active, annotations]);

  useLayoutEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const on = () => draw();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [draw]);

  const modalLabels = {
    quote: ui.quoteLabel,
    ideas: ui.ideasLabel,
    discussion: (n: number) =>
      isEnglish ? `${ui.discussionLabel} · ${ui.replies(n)}` : `${ui.discussionLabel} · ${n} 条`,
    pick: ui.selectThought,
  };
  const noteLabels = {
    distill: isEnglish ? 'Distilled · a conclusion to keep' : '沉淀 · 可保留的结论',
    enter: ui.enterDiscussion,
  };
  const windowTitle = isEnglish ? 'About Yomitomo · Reading' : '关于 Yomitomo · 阅读中';

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
      <div className="reader" ref={readerRef}>
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
                        setActive(active === segment.annotationId ? null : segment.annotationId)
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
              onActivate={setActive}
              onOpen={setModal}
            />
          ))}
        </div>
      </div>
      <DiscussionModal
        annotation={modal}
        agents={agents}
        labels={modalLabels}
        onClose={() => setModal(null)}
      />
    </div>
  );
}
