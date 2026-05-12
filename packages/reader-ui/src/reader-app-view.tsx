import React from 'react';
import { Bot, Funnel, List, MessageSquare, Settings2, X } from 'lucide-react';
import type {
  AgentReadingPlanItem,
  Annotation,
  FocusCoReadingPlan,
  MessageSendShortcut,
  PublicAgent,
  QuestionStatus,
  UserProfile,
} from '@yomitomo/shared';
import { annotationTypeLabel } from '@yomitomo/core';
import type { HighlightBox, TocItem } from '@yomitomo/core';
import {
  annotationFilterActiveCount,
  annotationFiltersEqual,
  buildAnnotationFilterFacets,
  buildAnnotationRailItems,
  buildHighlightSegments,
  buildTocAnnotationStats,
  countOpenQuestions,
  createEmptyAnnotationFilter,
  filterAnnotationsByFacets,
  highlightSegmentStyle,
  isAnnotationFilterActive,
  isPrimaryTocItem,
  pruneAnnotationFilter,
  selectionActionShortcut,
  toggleAnnotationFilterValue,
  type AnnotationFilterGroup,
  type AnnotationFilterState,
} from './reader-utils';
import {
  AgentReadingDock,
  AgentAnnotateMenu,
  AnnotationCard,
  AnnotationConnection,
  AnnotationFilterPanel,
  Composer,
  EmptyNotes,
  HighlightChoiceMenu,
  QuestionPanel,
  ReaderSettingsPanel,
  SelectionMenu,
  VirtualCursor,
  type ActiveConnection,
  type AgentDockItem,
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

const annotationFilterPanelId = 'reader-annotation-filter-panel';
const FILTERED_NOTE_EXIT_MS = 190;

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

function ReaderEdgeBlur({ position }: { position: 'top' | 'bottom' }) {
  return (
    <div className={`reader-edge-blur is-${position}`} aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

export type ReaderAppViewProps = {
  activeConnection: ActiveConnection | null;
  activeId: string | null;
  agentAnnotateOpen: boolean;
  agentDockCompleting: boolean;
  agentDockItems: AgentDockItem[];
  agentTheaterBoxes: HighlightBox[];
  agents: PublicAgent[];
  annotatingAgents: string[];
  annotationTotals: { annotations: number; comments: number };
  annotations: Annotation[];
  articleId: string;
  articleRef: React.RefObject<HTMLElement | null>;
  boxes: HighlightBox[];
  canvasRef: React.RefObject<HTMLDivElement | null>;
  commentsCloseKey: number;
  composer: PendingComposer | null;
  completionBurstKey: number;
  embedded?: boolean;
  extracted: ReaderArticle;
  filteredAnnotations: Annotation[];
  focusCoReadingPlan?: FocusCoReadingPlan;
  highlightChoice: HighlightChoice | null;
  notesOpen: boolean;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  replyRequest: { annotationId: string; key: number } | null;
  readerSettings: ReaderSettings;
  readingSections: ReaderReadingSection[];
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  messageSendShortcut: MessageSendShortcut;
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
  onCreateAnnotation: (note: string) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onAnswerQuestion: (annotationId: string) => void;
  onAnnotationLayoutChange?: () => void;
  onHighlightClick: (
    annotationId: string,
    event: React.MouseEvent<HTMLButtonElement>,
    annotationIds: string[],
  ) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onCloseHighlightChoice: () => void;
  onCloseFloatingPanels: () => void;
  onCloseResponsivePanels: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onCopySelection: (action: SelectionAction) => void | Promise<void>;
  onPlanFocusCoReading: (selectedAgentIds: string[]) => Promise<FocusCoReadingPlan>;
  onSaveFocusCoReadingPlan: (plan: FocusCoReadingPlan) => void | Promise<void>;
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
  agentDockCompleting,
  agentDockItems,
  agentTheaterBoxes,
  agents,
  annotatingAgents,
  annotationTotals,
  annotations,
  articleId,
  articleRef,
  boxes,
  canvasRef,
  commentsCloseKey,
  composer,
  completionBurstKey,
  embedded = false,
  extracted,
  filteredAnnotations,
  focusCoReadingPlan,
  highlightChoice,
  notesOpen,
  noteRefs,
  notesRef,
  replyRequest,
  readerSettings,
  readingSections,
  selectionAction,
  settingsOpen,
  messageSendShortcut,
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
  onCopySelection,
  onPlanFocusCoReading,
  onSaveFocusCoReadingPlan,
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
  const [annotationFilterOpen, setAnnotationFilterOpen] = React.useState(false);
  const [annotationFilter, setAnnotationFilter] = React.useState<AnnotationFilterState>(
    createEmptyAnnotationFilter,
  );
  const [railAnimation, setRailAnimation] = React.useState(() => ({
    ids: filteredAnnotations.map((annotation) => annotation.id),
    exitingIds: new Set<string>(),
  }));
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
  const visibleAnnotations = React.useMemo(
    () => filterAnnotationsByFacets(filteredAnnotations, annotationFilter),
    [annotationFilter, filteredAnnotations],
  );
  const annotationFilterFacets = React.useMemo(
    () => buildAnnotationFilterFacets(filteredAnnotations, annotationFilter, userProfile, agents),
    [agents, annotationFilter, filteredAnnotations, userProfile],
  );
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => visibleAnnotations.find((annotation) => annotation.id === id))
        .filter((annotation): annotation is Annotation => Boolean(annotation))
    : [];
  const visibleAnnotationIds = React.useMemo(
    () => new Set(visibleAnnotations.map((annotation) => annotation.id)),
    [visibleAnnotations],
  );
  const railAnnotationById = React.useMemo(
    () => new Map(filteredAnnotations.map((annotation) => [annotation.id, annotation])),
    [filteredAnnotations],
  );
  const railAnnotations = React.useMemo(
    () =>
      railAnimation.ids
        .map((id) => railAnnotationById.get(id))
        .filter((annotation): annotation is Annotation => Boolean(annotation)),
    [railAnimation.ids, railAnnotationById],
  );
  const exitingAnnotationIds = railAnimation.exitingIds;
  const annotationRailItems = React.useMemo(
    () => buildAnnotationRailItems(railAnnotations, boxes, activeId, noteHeights),
    [activeId, boxes, noteHeights, railAnnotations],
  );
  const questionCount = React.useMemo(() => countOpenQuestions(annotations), [annotations]);
  const filterActive = isAnnotationFilterActive(annotationFilter);
  const filterActiveCount = annotationFilterActiveCount(annotationFilter);
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
    const pruned = pruneAnnotationFilter(annotationFilter, filteredAnnotations);
    if (!annotationFiltersEqual(pruned, annotationFilter)) setAnnotationFilter(pruned);
    if (filteredAnnotations.length === 0) setAnnotationFilterOpen(false);
  }, [annotationFilter, filteredAnnotations]);

  React.useEffect(() => {
    const sourceIds = filteredAnnotations.map((annotation) => annotation.id);
    const sourceIdSet = new Set(sourceIds);
    const visibleIds = visibleAnnotations.map((annotation) => annotation.id);
    const visibleIdSet = new Set(visibleIds);

    setRailAnimation((current) => {
      const currentIds = current.ids.length > 0 ? current.ids : sourceIds;
      const exitingIds = currentIds.filter((id) => sourceIdSet.has(id) && !visibleIdSet.has(id));
      const renderedIds = new Set([...visibleIds, ...exitingIds]);
      return {
        ids: sourceIds.filter((id) => renderedIds.has(id)),
        exitingIds: new Set(exitingIds),
      };
    });

    const timeout = window.setTimeout(() => {
      setRailAnimation({
        ids: sourceIds.filter((id) => visibleIdSet.has(id)),
        exitingIds: new Set(),
      });
    }, FILTERED_NOTE_EXIT_MS);

    return () => window.clearTimeout(timeout);
  }, [filteredAnnotations, visibleAnnotations]);

  React.useEffect(() => {
    const visibleIds = new Set(railAnnotations.map((annotation) => annotation.id));
    for (const annotationId of noteRefCallbacksRef.current.keys()) {
      if (!visibleIds.has(annotationId)) noteRefCallbacksRef.current.delete(annotationId);
    }
    setNoteHeights((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([annotationId]) => visibleIds.has(annotationId)),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [railAnnotations]);

  React.useEffect(() => {
    if (!activeId || visibleAnnotationIds.has(activeId)) return;
    onCloseHighlightChoice();
    onClearActiveAnnotation();
  }, [activeId, onClearActiveAnnotation, onCloseHighlightChoice, visibleAnnotationIds]);

  React.useEffect(() => {
    if (!annotationFilterOpen) return;

    function handleFilterPanelKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== 'Escape') return;
      event.preventDefault();
      setAnnotationFilterOpen(false);
    }

    window.addEventListener('keydown', handleFilterPanelKeyDown);
    return () => window.removeEventListener('keydown', handleFilterPanelKeyDown);
  }, [annotationFilterOpen]);

  React.useEffect(() => () => noteResizeObserverRef.current?.disconnect(), []);

  React.useEffect(() => {
    if (!selectionAction || composer) return;
    const activeSelectionAction = selectionAction;

    function handleSelectionShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        return;
      }

      const shortcut = selectionActionShortcut(event);
      if (!shortcut) return;

      event.preventDefault();
      event.stopPropagation();
      if (shortcut === 'copy') {
        void onCopySelection(activeSelectionAction);
        return;
      }
      onOpenComposer(activeSelectionAction);
    }

    window.addEventListener('keydown', handleSelectionShortcut);
    return () => window.removeEventListener('keydown', handleSelectionShortcut);
  }, [composer, onCopySelection, onOpenComposer, selectionAction]);

  React.useLayoutEffect(() => {
    onAnnotationLayoutChange?.();
  }, [annotationRailItems, noteHeights, onAnnotationLayoutChange]);

  function highlightLabel(annotationId: string) {
    const index = annotations.findIndex((annotation) => annotation.id === annotationId);
    const annotation = annotations[index];
    const type = annotation?.annotationType
      ? annotationTypeLabel(annotation.annotationType)
      : '批注';
    return index >= 0 ? `打开${type} ${index + 1}` : '打开批注';
  }

  function clearAnnotationFilter() {
    setAnnotationFilter(createEmptyAnnotationFilter());
  }

  function toggleAnnotationFilterValueForGroup(group: AnnotationFilterGroup, value: string) {
    setAnnotationFilter((current) => toggleAnnotationFilterValue(current, group, value));
  }

  function toggleAnnotationFilter() {
    onCloseFloatingPanels();
    setAnnotationFilterOpen((open) => !open);
  }

  function toggleAgentAnnotate() {
    setAnnotationFilterOpen(false);
    onToggleAgentAnnotate();
  }

  function toggleSettings() {
    setAnnotationFilterOpen(false);
    onToggleSettings();
  }

  function handleReaderPointerDownCapture(event: React.PointerEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const target = event.target;

    if (settingsOpen || agentAnnotateOpen || annotationFilterOpen) {
      if (!target.closest('[data-reader-floating-panel],[data-reader-popover-anchor]')) {
        setAnnotationFilterOpen(false);
        onCloseFloatingPanels();
      }
    }

    if (composer && !target.closest('.reader-composer')) {
      onCancelComposer();
    }

    if (highlightChoice && !target.closest('.reader-highlight-choice-menu,.reader-highlight')) {
      onCloseHighlightChoice();
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
              filterActive || annotationFilterOpen
                ? 'reader-filter-toggle is-active'
                : 'reader-filter-toggle'
            }
            data-reader-popover-anchor
            type="button"
            disabled={filteredAnnotations.length === 0}
            onClick={toggleAnnotationFilter}
            aria-controls={annotationFilterPanelId}
            aria-expanded={annotationFilterOpen}
            aria-label="过滤筛选"
            aria-pressed={filterActive}
            title="过滤筛选"
          >
            <Funnel size={16} />
            <span>过滤筛选</span>
            {filterActive ? <b>{filterActiveCount}</b> : null}
          </button>
          <button
            className={
              agentAnnotateOpen ? 'reader-agent-annotate is-active' : 'reader-agent-annotate'
            }
            data-reader-popover-anchor
            type="button"
            disabled={agents.length === 0}
            onClick={toggleAgentAnnotate}
          >
            <Bot size={18} />
            {annotatingAgents.length > 0 ? '共读中' : '聚焦共读'}
          </button>
          <button
            className={settingsOpen ? 'reader-icon-button is-active' : 'reader-icon-button'}
            data-reader-popover-anchor
            type="button"
            onClick={toggleSettings}
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
            articleId={articleId}
            agents={agents}
            annotatingAgents={annotatingAgents}
            focusCoReadingPlan={focusCoReadingPlan}
            messageSendShortcut={messageSendShortcut}
            readingSections={readingSections}
            shortcutModifier={shortcutModifier}
            onCancel={onCancelAgentAnnotateMenu}
            onPlanFocusCoReading={onPlanFocusCoReading}
            onSaveFocusCoReadingPlan={onSaveFocusCoReadingPlan}
            onStartAgentPlan={onStartAgentReadingPlan}
          />
        </div>
      ) : null}

      {annotationFilterOpen ? (
        <AnnotationFilterPanel
          facets={annotationFilterFacets}
          panelProps={
            {
              'data-reader-floating-panel': '',
              id: annotationFilterPanelId,
            } as React.HTMLAttributes<HTMLDivElement>
          }
          onClear={clearAnnotationFilter}
          onToggle={toggleAnnotationFilterValueForGroup}
        />
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

        <div className="reader-surface-frame">
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
                  const dimmed =
                    filterActive &&
                    segment.annotationIds.every((id) => !visibleAnnotationIds.has(id));
                  const active = !dimmed && segment.annotationIds.includes(activeId || '');
                  const clickableAnnotationIds = segment.annotationIds.filter((id) =>
                    visibleAnnotationIds.has(id),
                  );
                  const annotationId = clickableAnnotationIds[0] || segment.annotationIds[0] || '';
                  const segmentStyle = {
                    ...highlightSegmentStyle(segment, active),
                    ...(dimmed ? { '--highlight-opacity': 0.42 } : {}),
                  } as React.CSSProperties;
                  return (
                    <button
                      aria-label={highlightLabel(annotationId)}
                      aria-disabled={dimmed || undefined}
                      className={[
                        'reader-highlight',
                        active ? 'is-active' : '',
                        dimmed ? 'is-filter-dimmed' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      key={`highlight-${segment.id}`}
                      style={segmentStyle}
                      tabIndex={dimmed ? -1 : undefined}
                      type="button"
                      onClick={
                        dimmed
                          ? undefined
                          : (event) => onHighlightClick(annotationId, event, clickableAnnotationIds)
                      }
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
                {annotations.length > 0 && visibleAnnotations.length === 0 ? (
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
                      exiting={exitingAnnotationIds.has(annotation.id)}
                      isStackFront={isStackFront}
                      messageSendShortcut={messageSendShortcut}
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
                  onCopy={() => onCopySelection(selectionAction)}
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
                  messageSendShortcut={messageSendShortcut}
                  shortcutModifier={shortcutModifier}
                  onCancel={onCancelComposer}
                  onSave={onCreateAnnotation}
                />
              ) : null}
            </div>
          </section>
          <ReaderEdgeBlur position="top" />
          <ReaderEdgeBlur position="bottom" />
        </div>

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

      <AgentReadingDock
        completionBurstKey={completionBurstKey}
        completing={agentDockCompleting}
        items={agentDockItems}
      />

      {virtualCursors.map((cursor) =>
        cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
      )}
    </div>
  );
}
