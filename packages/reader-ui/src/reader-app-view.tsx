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
  commentSide?: 'auto' | 'left' | 'right';
  commentsCloseKey: number;
  composer: PendingComposer | null;
  completionBurstKey: number;
  desktopConnected: boolean;
  embedded?: boolean;
  extracted: ReaderArticle;
  filteredAnnotations: Annotation[];
  brandMarkSrc?: string;
  hasSavedPairing: boolean;
  highlightChoice: HighlightChoice | null;
  notesOpen: boolean;
  noteRefs: React.MutableRefObject<Map<string, HTMLElement>>;
  notesRef: React.RefObject<HTMLElement | null>;
  pairingStatus: string;
  pairingId: string;
  pairingTokenDraft: string;
  replyRequest: { annotationId: string; key: number } | null;
  readerSettings: ReaderSettings;
  readingSections: ReaderReadingSection[];
  selectionAction: SelectionAction | null;
  settingsOpen: boolean;
  showConnectionSettings?: boolean;
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
  onCreateAnnotation: (
    note: string,
    annotationType: AnnotationType,
    readingIntent: AgentReadingIntent,
  ) => void | Promise<void>;
  onDeleteAnnotation: (annotationId: string) => void | Promise<void>;
  onFocusAnnotation: (annotationId: string) => void;
  onAnswerQuestion: (annotationId: string) => void;
  onHighlightClick: (annotationId: string, event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseUp: (event: React.MouseEvent<HTMLElement>) => void;
  onCloseHighlightChoice: () => void;
  onCloseFloatingPanels: () => void;
  onCloseResponsivePanels: () => void;
  onOpenComposer: (action: SelectionAction) => void;
  onStartAgentReadingPlan: (agent: PublicAgent, readingPlan: AgentReadingPlanItem[]) => void;
  onSavePairingToken: () => void | Promise<void>;
  onScrollToHeading: (item: TocItem) => void;
  onScrollToHighlight: (annotationId: string) => void;
  onSetAnnotationQuestionStatus: (annotationId: string, status: QuestionStatus) => void;
  onSetCommentQuestionStatus: (
    annotationId: string,
    commentId: string,
    status: QuestionStatus,
  ) => void;
  onSetPairingTokenDraft: (token: string) => void;
  onToggleNotes: () => void;
  onToggleToc: () => void;
  onToggleAgentAnnotate: () => void;
  onToggleSettings: () => void;
  onDisconnectDesktop: () => void | Promise<void>;
  onUpdateReaderSettings: (settings: ReaderSettings) => void | Promise<void>;
};

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
  commentSide = 'auto',
  commentsCloseKey,
  composer,
  completionBurstKey,
  desktopConnected,
  embedded = false,
  extracted,
  filteredAnnotations,
  brandMarkSrc,
  hasSavedPairing,
  highlightChoice,
  notesOpen,
  noteRefs,
  notesRef,
  pairingStatus,
  pairingId,
  pairingTokenDraft,
  replyRequest,
  readerSettings,
  readingSections,
  selectionAction,
  settingsOpen,
  showConnectionSettings = true,
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
  onCreateAnnotation,
  onDeleteAnnotation,
  onFocusAnnotation,
  onAnswerQuestion,
  onHighlightClick,
  onMouseUp,
  onCloseHighlightChoice,
  onCloseFloatingPanels,
  onCloseResponsivePanels,
  onOpenComposer,
  onStartAgentReadingPlan,
  onSavePairingToken,
  onScrollToHeading,
  onScrollToHighlight,
  onSetAnnotationQuestionStatus,
  onSetCommentQuestionStatus,
  onSetPairingTokenDraft,
  onToggleNotes,
  onToggleToc,
  onToggleAgentAnnotate,
  onToggleSettings,
  onDisconnectDesktop,
  onUpdateReaderSettings,
}: ReaderAppViewProps) {
  const activeAnnotation = annotations.find((item) => item.id === activeId) || null;
  const logoUrl = brandMarkSrc || defaultBrandMarkSrc();
  const highlightChoiceAnnotations = highlightChoice
    ? highlightChoice.annotationIds
        .map((id) => annotations.find((annotation) => annotation.id === id))
        .filter((annotation): annotation is Annotation => Boolean(annotation))
    : [];
  const annotationRailItems = React.useMemo(
    () => buildAnnotationRailItems(filteredAnnotations, boxes, activeId),
    [activeId, boxes, filteredAnnotations],
  );
  const questionCount = React.useMemo(() => countOpenQuestions(annotations), [annotations]);
  const highlightSegments = React.useMemo(() => buildHighlightSegments(boxes), [boxes]);
  const temporarySegments = React.useMemo(
    () => buildHighlightSegments(temporaryBoxes),
    [temporaryBoxes],
  );
  const agentTheaterSegments = React.useMemo(
    () => buildHighlightSegments(agentTheaterBoxes),
    [agentTheaterBoxes],
  );

  function highlightLabel(annotationId: string) {
    const index = annotations.findIndex((annotation) => annotation.id === annotationId);
    const annotation = annotations[index];
    const type = annotation?.annotationType
      ? annotationTypeLabel(annotation.annotationType)
      : '批注';
    return index >= 0 ? `打开${type} ${index + 1}` : '打开批注';
  }

  function handleOutsidePanelPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!settingsOpen && !agentAnnotateOpen) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-reader-floating-panel],[data-reader-popover-anchor]')) return;
    onCloseFloatingPanels();
  }

  return (
    <div
      className={[
        'reader-app',
        embedded ? 'is-embedded' : '',
        tocOpen ? 'is-toc-open' : '',
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
      onPointerDownCapture={handleOutsidePanelPointerDown}
    >
      <header className="reader-toolbar">
        {embedded ? (
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
        ) : (
          <div className="reader-brand">
            {logoUrl ? (
              <img className="reader-brand-mark" src={logoUrl} alt="" />
            ) : (
              <span className="reader-brand-mark">Y</span>
            )}
            <div className="reader-brand-copy">
              <div className="reader-brand-title">Yomitomo</div>
              <p>
                <span
                  className={
                    desktopConnected
                      ? 'reader-connection is-connected'
                      : 'reader-connection is-disconnected'
                  }
                />
                阅读器模式
              </p>
            </div>
          </div>
        )}
        <div className="reader-toolbar-actions">
          <button
            className={
              tocOpen
                ? 'reader-icon-button reader-toc-toggle is-active'
                : 'reader-icon-button reader-toc-toggle'
            }
            type="button"
            onClick={onToggleToc}
            aria-label="切换目录"
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
            disabled={!desktopConnected || agents.length === 0}
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
          desktopConnected={desktopConnected}
          pairingId={pairingId}
          pairingStatus={pairingStatus}
          pairingTokenDraft={pairingTokenDraft}
          hasSavedPairing={hasSavedPairing}
          settings={readerSettings}
          onChange={onUpdateReaderSettings}
          onDisconnectDesktop={onDisconnectDesktop}
          onSavePairingToken={onSavePairingToken}
          onSetPairingTokenDraft={onSetPairingTokenDraft}
          showConnection={showConnectionSettings}
        />
      ) : null}

      <button
        className="reader-responsive-scrim"
        type="button"
        aria-label="关闭侧栏"
        onClick={onCloseResponsivePanels}
      />

      <main className="reader-main">
        <aside className={tocItems.length > 0 ? 'reader-toc' : 'reader-toc is-empty'}>
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
              <header className="reader-article-header">
                <h1>{extracted.title}</h1>
                {extracted.byline || extracted.excerpt ? (
                  <p>{[extracted.byline, extracted.excerpt].filter(Boolean).join(' · ')}</p>
                ) : null}
              </header>
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
                    desktopConnected={desktopConnected}
                    isStackFront={isStackFront}
                    key={annotation.id}
                    noteRef={(element) => {
                      if (element) noteRefs.current.set(annotation.id, element);
                      else noteRefs.current.delete(annotation.id);
                    }}
                    commentSide={commentSide}
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
                desktopConnected={desktopConnected}
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

function defaultBrandMarkSrc() {
  const runtime = (
    globalThis as {
      chrome?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).chrome?.runtime;
  return runtime?.getURL?.('icon/128.png') || '';
}
