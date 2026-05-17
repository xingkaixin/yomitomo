import React from 'react';
import { AgentReadingDock } from './reader-agent-reading-dock';
import { AnnotationConnection } from './reader-annotation-connection';
import { ReaderFloatingPanels } from './reader-floating-panels';
import { ReaderSurfaceView } from './reader-surface-view';
import { ReaderTocPanel } from './reader-toc-panel';
import { ReaderToolbar } from './reader-toolbar';
import { VirtualCursor } from './reader-virtual-cursor';
import type { AnnotationNavigationDirection, ReaderAppViewProps } from './reader-app-view-types';
import { useReaderAnnotationRail } from './use-reader-annotation-rail';
import { useReaderShellInteractions } from './use-reader-shell-interactions';

export type {
  AnnotationNavigationDirection,
  AnnotationNavigationRequest,
  AnnotationNavigationState,
  HighlightChoice,
  PendingComposer,
  ReaderAppViewProps,
  ReaderArticle,
  SelectionAction,
} from './reader-app-view-types';

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
  articleContent,
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
  noteRefs,
  notesRef,
  readerSettings,
  readingSections,
  selectionAction,
  settingsOpen,
  messageSendShortcut,
  selectionActionShortcuts,
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
  onAnnotationLayoutChange,
  onResolveAnnotationNavigation,
  onNavigateAnnotation,
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
  onDeleteComment,
  onScrollToHeading,
  onScrollToHighlight,
  onToggleToc,
  onToggleAgentAnnotate,
  onToggleSettings,
  onUpdateReaderSettings,
}: ReaderAppViewProps) {
  const [navigationVersion, setNavigationVersion] = React.useState(0);
  const {
    annotationRailItems,
    exitingAnnotationIds,
    expandedPrimaryCommentIds,
    noteRefForAnnotation,
    setPrimaryCommentExpanded,
    visibleAnnotationIds,
    visibleAnnotations,
    visibleRailAnnotations,
  } = useReaderAnnotationRail({
    activeId,
    annotations,
    articleId,
    boxes,
    commentsCloseKey,
    filteredAnnotations,
    noteRefs,
    onAnnotationLayoutChange,
  });
  const { handleReaderPointerDownCapture, toggleAgentAnnotate, toggleSettings } =
    useReaderShellInteractions({
      activeId,
      agentAnnotateOpen,
      composer,
      highlightChoice,
      selectionAction,
      selectionActionShortcuts,
      settingsOpen,
      visibleAnnotationIds,
      onCancelComposer,
      onClearActiveAnnotation,
      onCloseFloatingPanels,
      onCloseHighlightChoice,
      onCopySelection,
      onOpenComposer,
      onToggleAgentAnnotate,
      onToggleSettings,
    });
  const annotationNavigation = React.useMemo(
    () =>
      onResolveAnnotationNavigation?.({ activeId, annotations: visibleAnnotations }) ?? {
        previousId: null,
        nextId: null,
      },
    [activeId, navigationVersion, onResolveAnnotationNavigation, visibleAnnotations],
  );
  const hasToc = tocItems.length > 0;

  React.useEffect(() => {
    if (!onResolveAnnotationNavigation) return;
    const surface = surfaceRef.current;
    if (!surface) return;

    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setNavigationVersion((version) => version + 1));
    };

    surface.addEventListener('scroll', schedule, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      surface.removeEventListener('scroll', schedule);
    };
  }, [onResolveAnnotationNavigation, surfaceRef]);

  function navigateAnnotation(direction: AnnotationNavigationDirection) {
    const annotationId =
      direction === 'previous' ? annotationNavigation.previousId : annotationNavigation.nextId;
    if (!annotationId) return;
    onNavigateAnnotation?.(annotationId, direction);
  }

  return (
    <div
      className={[
        'reader-app',
        embedded ? 'is-embedded' : '',
        hasToc ? 'has-toc' : '',
        hasToc && tocOpen ? 'is-toc-open' : '',
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
      <ReaderToolbar
        agentAnnotateOpen={agentAnnotateOpen}
        annotatingAgentsCount={annotatingAgents.length}
        annotationNavigation={annotationNavigation}
        extracted={extracted}
        hasAgents={agents.length > 0}
        hasToc={hasToc}
        settingsOpen={settingsOpen}
        showAnnotationNavigation={Boolean(onResolveAnnotationNavigation && onNavigateAnnotation)}
        tocOpen={tocOpen}
        toolbarArticleAction={toolbarArticleAction}
        onClose={onClose}
        onNavigateAnnotation={navigateAnnotation}
        onToggleAgentAnnotate={toggleAgentAnnotate}
        onToggleSettings={toggleSettings}
        onToggleToc={onToggleToc}
      />

      <ReaderFloatingPanels
        agentAnnotateOpen={agentAnnotateOpen}
        agents={agents}
        annotatingAgents={annotatingAgents}
        articleId={articleId}
        focusCoReadingPlan={focusCoReadingPlan}
        messageSendShortcut={messageSendShortcut}
        readerSettings={readerSettings}
        readingSections={readingSections}
        settingsOpen={settingsOpen}
        shortcutModifier={shortcutModifier}
        onCancelAgentAnnotateMenu={onCancelAgentAnnotateMenu}
        onPlanFocusCoReading={onPlanFocusCoReading}
        onSaveFocusCoReadingPlan={onSaveFocusCoReadingPlan}
        onStartAgentReadingPlan={onStartAgentReadingPlan}
        onUpdateReaderSettings={onUpdateReaderSettings}
      />

      <button
        className="reader-responsive-scrim"
        type="button"
        aria-label="关闭侧栏"
        onClick={onCloseResponsivePanels}
      />

      <main className="reader-main">
        <ReaderTocPanel
          annotationTotals={annotationTotals}
          hasToc={hasToc}
          tocAnnotationStats={tocAnnotationStats}
          tocItems={tocItems}
          tocOpen={tocOpen}
          onScrollToHeading={onScrollToHeading}
        />

        <ReaderSurfaceView
          activeId={activeId}
          agentTheaterBoxes={agentTheaterBoxes}
          agents={agents}
          annotationRailItems={annotationRailItems}
          annotations={annotations}
          articleContent={articleContent}
          articleRef={articleRef}
          boxes={boxes}
          canvasRef={canvasRef}
          commentsCloseKey={commentsCloseKey}
          composer={composer}
          exitingAnnotationIds={exitingAnnotationIds}
          expandedPrimaryCommentIds={expandedPrimaryCommentIds}
          extracted={extracted}
          highlightChoice={highlightChoice}
          messageSendShortcut={messageSendShortcut}
          noteRefForAnnotation={noteRefForAnnotation}
          notesRef={notesRef}
          selectionAction={selectionAction}
          selectionActionShortcuts={selectionActionShortcuts}
          shortcutModifier={shortcutModifier}
          surfaceRef={surfaceRef}
          temporaryBoxes={temporaryBoxes}
          userProfile={userProfile}
          visibleAnnotationIds={visibleAnnotationIds}
          visibleAnnotations={visibleAnnotations}
          visibleRailAnnotations={visibleRailAnnotations}
          onAddComment={onAddComment}
          onCancelComposer={onCancelComposer}
          onCloseHighlightChoice={onCloseHighlightChoice}
          onCopySelection={onCopySelection}
          onCreateAnnotation={onCreateAnnotation}
          onDeleteAnnotation={onDeleteAnnotation}
          onDeleteComment={onDeleteComment}
          onFocusAnnotation={onFocusAnnotation}
          onHighlightClick={onHighlightClick}
          onMouseUp={onMouseUp}
          onOpenComposer={onOpenComposer}
          onPrimaryCommentExpandedChange={setPrimaryCommentExpanded}
          onScrollToHighlight={onScrollToHighlight}
        />
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
