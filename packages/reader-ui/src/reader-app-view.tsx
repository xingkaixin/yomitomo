import React from 'react';
import { Bot, List, MessageSquare, Settings2, X } from 'lucide-react';
import type {
  AgentReadingPlanItem,
  AgentReadingIntent,
  Annotation,
  AnnotationType,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import { annotationTypeLabel } from '@yomitomo/core';
import type { HighlightBox, TocItem } from '@yomitomo/core';
import {
  buildAnnotationRailItems,
  buildHighlightSegments,
  buildTocAnnotationStats,
  countOpenQuestions,
  highlightSegmentStyle,
  isPrimaryTocItem,
} from './reader-utils';
import {
  AgentAnnotateMenu,
  AnnotationCard,
  AnnotationConnection,
  Composer,
  EmptyNotes,
  HighlightChoiceMenu,
  QuestionPanel,
  ReaderSettingsPanel,
  ReadingCompletionBurst,
  SelectionMenu,
  VirtualCursor,
  type ActiveConnection,
  type HighlightChoiceAction,
  type ReaderSettings,
  type ReaderReadingSection,
  type VirtualCursorState,
} from './reader-components';

export type SelectionAction = {
  x: number;
  y: number;
  anchor: Annotation['anchor'];
};

export type PendingComposer = SelectionAction;

export type HighlightChoice = HighlightChoiceAction & {
  annotationIds: string[];
};

export type ReaderArticle = {
  title: string;
  byline?: string;
  excerpt?: string;
  content: string;
};

function HighlightDots({ colors }: { colors: string[] }) {
  if (colors.length <= 1) return null;

  return (
    <>
      <span className="reader-highlight-dots is-start" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
      <span className="reader-highlight-dots is-end" aria-hidden="true">
        {colors.map((color, index) => (
          <i key={`${color}-${index}`} style={{ backgroundColor: color }} />
        ))}
      </span>
    </>
  );
}

export type ReaderAppViewProps = {
  activeConnection: ActiveConnection | null;
  activeId: string | null;
  agentAnnotateOpen: boolean;
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotatingAgents: string[];
  annotationTotals: { annotations: number; comments: number };
  annotations: Annotation[];
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  completionBurstKey: number;
  embedded?: boolean;
  extracted: ReaderArticle;
  filteredAnnotations: Annotation[];
  highlightChoice: HighlightChoice | null;
  notesOpen: boolean;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  replyRequest: { annotationId: string; key: number } | null;
  readerSettings: ReaderSettings;
  readingSections: ReaderReadingSection[];
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  shortcutModifier: string;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  temporaryBoxes: HighlightBox[];
  toolbarArticleAction?: React.ReactNode;
  tocOpen: boolean;
  tocAnnotationStats: ReturnType<typeof buildTocAnnotationStats>;
  tocItems: TocItem[];
  userProfile: UserProfile;
  virtualCursors: VirtualCursorState[];
  onAddComment: (annotationId: string, content: string) => void | Promise<void>;
  onCancelAgentAnnotateMenu: () => void;
  onCancelComposer: () => void;
  onClose: () => void;
  onClearActiveAnnotation: () => void;
  onCreateAnnotation: (
    note: string,
    annotationType: AnnotationType,
    readingIntent: AgentReadingIntent,
  ) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onAnswerQuestion: (annotationId: string) => void;
  onAnnotationLayoutChange?: () => void;
  onHighlightClick: (annotationId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onCloseHighlightChoice: () => void;
  onCloseFloatingPanels: () => void;
  onCloseResponsivePanels: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onStartAgentReadingPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
  onScrollToHeading: (item: TocItem) => void;
  onScrollToHighlight: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
  onToggleNotes: () => void;
  onToggleToc: () => void;
  onToggleAgentAnnotate: () => void;
  onToggleSettings: () => void;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

const activeAnnotationPreserveSelector = [
  'button',
  'textarea',
  'input',
  'select',
  'a',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[data-reader-floating-panel]',
  '[data-reader-popover-anchor]',
  '.reader-toolbar',
  '.reader-toc',
  '.reader-question-drawer',
  '.reader-note',
  '.reader-highlight',
  '.reader-selection-menu',
  '.reader-composer',
  '.reader-highlight-choice-menu',
].join(',');

export function ReaderAppView({
  activeConnection,
  activeId,
  agentAnnotateOpen,
  agentTheaterBoxes,
  agents,
  annotatingAgents,
  annotationTotals,
  annotations,
  articleRef,
  boxes,
  canvasRef,
  commentsCloseKey,
  composer,
  completionBurstKey,
  embedded = false,
  extracted,
  filteredAnnotations,
  highlightChoice,
  notesOpen,
  noteRefs,
  notesRef,
  replyRequest,
  readerSettings,
  readingSections,
  selectionAction,
  settingsOpen,
  shortcutModifier,
  surfaceRef,
  temporaryBoxes,
  toolbarArticleAction,
  tocOpen,
  tocAnnotationStats,
  tocItems,
  userProfile,
  virtualCursors,
  onAddComment,
  onCancelAgentAnnotateMenu,
  onCancelComposer,
  onClose,
  onClearActiveAnnotation,
  onCreateAnnotation,
  onDeleteAnnotation,
  onFocusAnnotation,
  onAnswerQuestion,
  onAnnotationLayoutChange,
  onHighlightClick,
  onMouseUp,
  onCloseHighlightChoice,
  onCloseFloatingPanels,
  onCloseResponsivePanels,
  onOpenComposer,
  onStartAgentReadingPlan,
  onScrollToHeading,
  onScrollToHighlight,
  onSetAnnotationQuestionStatus,
  onSetCommentQuestionStatus,
  onToggleNotes,
  onToggleToc,
  onToggleAgentAnnotate,
  onToggleSettings,
  onUpdateReaderSettings,
}: ReaderAppViewProps) {
  const [noteHeights, setNoteHeights] = React.useState<Record<string, number>>({});
  const noteElementsRef = React.useRef(new Map<string, HTMLElement>());
  const noteRefCallbacksRef = React.useRef(
    new Map<string, (element: HTMLElement | null) => void>(),
  );
  const noteResizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const registerNoteElementRef = React.useRef<
    (annotationId: string, element: HTMLElement | null) => void
  >(() => {});
  const activeAnnotation = annotations.find((item) => item.id === activeId) || null;
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => annotations.find((annotation) => annotation.id === id))
        .filter((annotation): annotation is Annotation => Boolean(annotation))
    : [];
  const annotationRailItems = React.useMemo(
    () => buildAnnotationRailItems(filteredAnnotations, boxes, activeId, noteHeights),
    [activeId, boxes, filteredAnnotations, noteHeights],
  );
  const questionCount = React.useMemo(() => countOpenQuestions(annotations), [annotations]);
  const hasToc = tocItems.length > 0;
  const highlightSegments = React.useMemo(() => buildHighlightSegments(boxes), [boxes]);
  const temporarySegments = React.useMemo(
    () => buildHighlightSegments(temporaryBoxes),
    [temporaryBoxes],
  );
  const agentTheaterSegments = React.useMemo(
    () => buildHighlightSegments(agentTheaterBoxes),
    [agentTheaterBoxes],
  );

  const updateNoteHeight = React.useCallback((annotationId: string, height: number) => {
    const nextHeight = Math.ceil(height);
    if (nextHeight <= 0) return;
    setNoteHeights((current) =>
      current[annotationId] === nextHeight ? current : { ...current, [annotationId]: nextHeight },
    );
  }, []);

  const registerNoteElement = React.useCallback(
    (annotationId: string, element: HTMLElement | null) => {
      const existing = noteElementsRef.current.get(annotationId);
      if (existing && existing !== element) noteResizeObserverRef.current?.unobserve(existing);

      if (!element) {
        if (existing) noteResizeObserverRef.current?.unobserve(existing);
        noteElementsRef.current.delete(annotationId);
        noteRefs.current.delete(annotationId);
        setNoteHeights((current) => {
          if (!(annotationId in current)) return current;
          const next = { ...current };
          delete next[annotationId];
          return next;
        });
        return;
      }

      noteElementsRef.current.set(annotationId, element);
      noteRefs.current.set(annotationId, element);
      updateNoteHeight(annotationId, element.getBoundingClientRect().height);

      if (typeof ResizeObserver === 'undefined') return;
      if (!noteResizeObserverRef.current) {
        noteResizeObserverRef.current = new ResizeObserver((entries) => {
          setNoteHeights((current) => {
            let next = current;
            for (const entry of entries) {
              const id = entry.target.getAttribute('data-annotation-id');
              const height = Math.ceil(entry.contentRect.height);
              if (!id || height <= 0 || current[id] === height) continue;
              if (next === current) next = { ...current };
              next[id] = height;
            }
            return next;
          });
        });
      }
      noteResizeObserverRef.current.observe(element);
    },
    [noteRefs, updateNoteHeight],
  );

  registerNoteElementRef.current = registerNoteElement;

  const noteRefForAnnotation = React.useCallback((annotationId: string) => {
    const existing = noteRefCallbacksRef.current.get(annotationId);
    if (existing) return existing;

    const callback = (element: HTMLElement | null) => {
      registerNoteElementRef.current(annotationId, element);
    };
    noteRefCallbacksRef.current.set(annotationId, callback);
    return callback;
  }, []);

  React.useEffect(() => {
    const visibleIds = new Set(filteredAnnotations.map((annotation) => annotation.id));
    for (const annotationId of noteRefCallbacksRef.current.keys()) {
      if (!visibleIds.has(annotationId)) noteRefCallbacksRef.current.delete(annotationId);
    }
    setNoteHeights((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([annotationId]) => visibleIds.has(annotationId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [filteredAnnotations]);

  React.useEffect(() => () => noteResizeObserverRef.current?.disconnect(), []);

  React.useLayoutEffect(() => {
    onAnnotationLayoutChange?.();
  }, [noteHeights, onAnnotationLayoutChange]);

  function highlightLabel(annotationId: string) {
    const index = annotations.findIndex((annotation) => annotation.id === annotationId);
    const annotation = annotations[index];
    const type = annotation?.annotationType
      ? annotationTypeLabel(annotation.annotationType)
      : '批注';
    return index >= 0 ? `打开${type} ${index + 1}` : '打开批注';
  }

  function handleReaderPointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const target = event.target;

    if (settingsOpen || agentAnnotateOpen) {
      if (!target.closest('[data-reader-floating-panel],[data-reader-popover-anchor]')) {
        onCloseFloatingPanels();
      }
    }

    if (!activeId) return;
    if (target.closest(activeAnnotationPreserveSelector)) return;

    onCloseHighlightChoice();
    onClearActiveAnnotation();
  }

  return (
    <div
      className={[
        'reader-app',
        embedded ? 'is-embedded' : '',
        hasToc ? 'has-toc' : '',
        hasToc && tocOpen ? 'is-toc-open' : '',
        notesOpen ? 'is-notes-open' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--reader-font-size': `${readerSettings.fontSize}px`,
          '--reader-content-width': `${readerSettings.contentWidth}px`,
        } as React.CSSProperties
      }
      onPointerDownCapture={handleReaderPointerDownCapture}
    >
      <header className="reader-toolbar">
        <div className="reader-toolbar-article">
          <div className="reader-toolbar-article-copy">
            <div className="reader-toolbar-article-title">{extracted.title}</div>
            {extracted.byline || extracted.excerpt ? (
              <p className="reader-toolbar-article-meta">
                {extracted.byline ? <span>{extracted.byline}</span> : null}
                {extracted.excerpt ? <span>{extracted.excerpt}</span> : null}
              </p>
            ) : null}
          </div>
          {toolbarArticleAction ? (
            <div className="reader-toolbar-article-action">{toolbarArticleAction}</div>
          ) : null}
        </div>
        <div className="reader-toolbar-actions">
          <button
            className={
              hasToc && tocOpen
                ? 'reader-icon-button reader-toc-toggle is-active'
                : 'reader-icon-button reader-toc-toggle'
            }
            type="button"
            disabled={!hasToc}
            onClick={onToggleToc}
            aria-label="切换目录"
            aria-pressed={hasToc && tocOpen}
          >
            <List size={18} />
          </button>
          <button
            className={
              notesOpen
                ? 'reader-icon-button reader-notes-toggle is-active'
                : 'reader-icon-button reader-notes-toggle'
            }
            type="button"
            onClick={onToggleNotes}
            aria-label="切换未决问题"
            title="未决问题"
          >
            <MessageSquare size={18} />
            <span>{questionCount}</span>
          </button>
          <button
            className={
              agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
            }
            data-reader-popover-anchor
            type="button"
            disabled={agents.length === 0}
            onClick={onToggleAgentAnnotate}
          >
            <Bot size={18} />
            {annotatingAgents.length > 0 ? '精读中' : '助手精读'}
          </button>
          <button
            className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
            data-reader-popover-anchor
            type="button"
            onClick={onToggleSettings}
            aria-label="阅读设置"
          >
            <Settings2 size={18} />
          </button>
          <button className="reader-close" type="button" onClick={onClose} aria-label="关闭阅读器">
            <X size={18} />
          </button>
        </div>
      </header>

      {agentAnnotateOpen ? (
        <div className="reader-agent-annotate-popover" data-reader-floating-panel>
          <button
            className="reader-agent-annotate-scrim"
            type="button"
            aria-label="取消编排"
            onClick={onCancelAgentAnnotateMenu}
          />
          <AgentAnnotateMenu
            agents={agents}
            annotatingAgents={annotatingAgents}
            readingSections={readingSections}
            onCancel={onCancelAgentAnnotateMenu}
            onStartAgentPlan={onStartAgentReadingPlan}
          />
        </div>
      ) : null}

      {settingsOpen ? (
        <ReaderSettingsPanel
          panelProps={{ 'data-reader-floating-panel': '' } as React.HTMLAttributes<HTMLDivElement>}
          settings={readerSettings}
          onChange={onUpdateReaderSettings}
        />
      ) : null}

      <button
        className="reader-responsive-scrim"
        type="button"
        aria-label="关闭侧栏"
        onClick={onCloseResponsivePanels}
      />

      <main className="reader-main">
        <aside
          className={hasToc ? 'reader-toc' : 'reader-toc is-empty'}
          aria-hidden={!hasToc || !tocOpen}
          aria-label="目录"
        >
          <div className="reader-toc-title">目录</div>
          {tocItems.map((item) => {
            const stats = isPrimaryTocItem(item) ? tocAnnotationStats.get(item.index) : undefined;
            return (
              <button
                className="reader-toc-item"
                data-depth={Math.min(item.depth, 4)}
                key={`${item.index}-${item.text}`}
                type="button"
                onClick={() => onScrollToHeading(item)}
              >
                <span className="reader-toc-item-main">
                  <span>{item.text}</span>
                  <span className="reader-toc-meta">
                    {(stats?.colors.length || 0) > 0 ? (
                      <span className="reader-toc-markers">
                        {stats!.colors.slice(0, 5).map((color) => (
                          <i key={color} style={{ backgroundColor: color }} />
                        ))}
                      </span>
                    ) : null}
                    {(stats?.count || 0) > 0 ? <strong>{stats?.count}</strong> : null}
                  </span>
                </span>
              </button>
            );
          })}
          <div className="reader-toc-summary">
            共 {annotationTotals.annotations} 条批注 · {annotationTotals.comments} 条评论
          </div>
        </aside>

        <section className="reader-surface" ref={surfaceRef} onMouseUp={onMouseUp}>
          <div className="reader-canvas" ref={canvasRef}>
            <article className="reader-article" ref={articleRef}>
              <div
                className="reader-article-body"
                dangerouslySetInnerHTML={{ __html: extracted.content }}
              />
            </article>
            <div className="reader-highlight-layer">
              {highlightSegments.map((segment) => {
                const active = segment.annotationIds.includes(activeId || '');
                const annotationId = segment.annotationIds[0] || '';
                return (
                  <button
                    aria-label={highlightLabel(annotationId)}
                    className={active ? 'reader-highlight is-active' : 'reader-highlight'}
                    key={`highlight-${segment.id}`}
                    style={highlightSegmentStyle(segment, active) as React.CSSProperties}
                    type="button"
                    onClick={(event) => onHighlightClick(annotationId, event)}
                  >
                    <HighlightDots colors={segment.colors} />
                  </button>
                );
              })}
              {temporarySegments.map((segment) => (
                <div
                  className="reader-highlight is-temporary"
                  key={`temporary-${segment.id}`}
                  style={highlightSegmentStyle(segment, false) as React.CSSProperties}
                >
                  <HighlightDots colors={segment.colors} />
                </div>
              ))}
              {agentTheaterSegments.map((segment) => (
                <div
                  className="reader-highlight is-agent-theater"
                  key={`agent-theater-${segment.id}`}
                  style={highlightSegmentStyle(segment, false) as React.CSSProperties}
                >
                  <HighlightDots colors={segment.colors} />
                </div>
              ))}
            </div>
            <aside className="reader-annotation-rail" ref={notesRef} aria-label="文章批注">
              {annotations.length === 0 ? <EmptyNotes /> : null}
              {annotations.length > 0 && filteredAnnotations.length === 0 ? (
                <div className="reader-empty">
                  <strong>没有匹配的批注</strong>
                  <p>当前筛选项下没有批注。</p>
                </div>
              ) : null}
              {annotationRailItems.map(
                ({ annotation, isStackFront, stackCount, stackIndex, style }) => (
                  <AnnotationCard
                    active={annotation.id === activeAnnotation?.id}
                    agents={agents}
                    annotation={annotation}
                    isStackFront={isStackFront}
                    key={annotation.id}
                    noteRef={noteRefForAnnotation(annotation.id)}
                    shortcutModifier={shortcutModifier}
                    stackCount={stackCount}
                    stackIndex={stackIndex}
                    commentsCloseKey={commentsCloseKey}
                    replyRequestKey={
                      replyRequest?.annotationId === annotation.id ? replyRequest.key : undefined
                    }
                    style={style}
                    userProfile={userProfile}
                    onAddComment={onAddComment}
                    onDelete={onDeleteAnnotation}
                    onFocus={onScrollToHighlight}
                  />
                ),
              )}
            </aside>
            {selectionAction && !composer ? (
              <SelectionMenu
                action={selectionAction}
                onAnnotate={() => onOpenComposer(selectionAction)}
              />
            ) : null}
            {highlightChoice && highlightChoiceAnnotations.length > 1 ? (
              <HighlightChoiceMenu
                action={highlightChoice}
                agents={agents}
                annotations={highlightChoiceAnnotations}
                userProfile={userProfile}
                onCancel={onCloseHighlightChoice}
                onSelect={onFocusAnnotation}
              />
            ) : null}
            {composer ? (
              <Composer
                agents={agents}
                composer={composer}
                shortcutModifier={shortcutModifier}
                onCancel={onCancelComposer}
                onSave={onCreateAnnotation}
              />
            ) : null}
          </div>
        </section>

        <aside className="reader-question-drawer">
          <QuestionPanel
            agents={agents}
            annotations={annotations}
            userProfile={userProfile}
            onAnswer={onAnswerQuestion}
            onFocus={onScrollToHighlight}
            onSetAnnotationQuestionStatus={onSetAnnotationQuestionStatus}
            onSetCommentQuestionStatus={onSetCommentQuestionStatus}
          />
        </aside>
      </main>

      {activeConnection ? <AnnotationConnection connection={activeConnection} /> : null}

      {completionBurstKey > 0 ? <ReadingCompletionBurst key={completionBurstKey} /> : null}

      {virtualCursors.map((cursor) =>
        cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
      )}
    </div>
  );
}
