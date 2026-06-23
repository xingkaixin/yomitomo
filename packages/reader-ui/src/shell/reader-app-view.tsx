import React from 'react';
import { AgentReadingDock } from '../agent/reader-agent-reading-dock';
import { AnnotationConnection } from '../annotations/reader-annotation-connection';
import { ReaderChatPanel } from './reader-chat-panel';
import { ReaderFloatingPanels } from './reader-floating-panels';
import { ReaderSurfaceView } from './reader-surface-view';
import { ReaderTocPanel } from './reader-toc-panel';
import { ReaderFloatingToolbar, ReaderToolbar } from './reader-toolbar';
import { VirtualCursor } from './reader-virtual-cursor';
import type { ReaderAppViewProps, ReaderUiLabels } from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { readerBackgroundTone } from '../reader-settings';
import { useReaderShellState } from './use-reader-shell-state';

type ReaderAppStyle = React.CSSProperties & {
  '--reader-font-size': string;
  '--reader-content-width': string;
  '--reader-content-bg': string;
  '--reader-layout-article-width'?: string;
};

export type {
  AnnotationNavigationDirection,
  AnnotationNavigationRequest,
  AnnotationNavigationState,
  HighlightChoice,
  PendingComposer,
  ReaderAppViewProps,
  ReaderArticle,
  ReaderUiLabels,
  SelectionAction,
} from './reader-app-view-types';

export function ReaderAppView({
  actions,
  agents: agentModel,
  annotations: annotationModel,
  article,
  chat,
  labels = defaultReaderUiLabels,
  options,
  refs,
  selection,
  settings,
  toc,
  toolbar,
  userProfile,
}: ReaderAppViewProps) {
  const {
    annotation: annotationActions,
    chat: chatActions,
    selection: selectionActions,
    shell,
    toc: tocActions,
  } = actions;
  const {
    activeConnection,
    activeId,
    annotationTotals,
    annotations,
    autoExpandNewAnnotations,
    boxes,
    commentsCloseKey,
    distillationAnimation,
    filteredAnnotations,
    newAnnotationIds,
    railLayoutOverride,
    railViewportHeight,
    railViewportTop,
    searchBoxes,
    showEmptyNotes,
    temporaryBoxes,
  } = annotationModel;
  const {
    agents,
    completionBurstKey,
    dockCompleting,
    dockItems,
    pendingAnnotationAgents = {},
    reviewAgents = [],
    theaterBoxes,
    virtualCursors,
  } = agentModel;
  const {
    messageSendShortcut,
    readerSettings,
    selectionActionShortcuts,
    settingsOpen,
    shortcutModifier,
    showSettings = true,
  } = settings;
  const { composer, copyRequestKey = 0, highlightChoice, selectionAction } = selection;
  const { articleRef, canvasRef, noteRefs, notesRef, surfaceRef } = refs;
  const { embedded = false } = options ?? {};
  const tocOpen = toc.open;
  const tocItems = toc.items;
  const {
    annotationNavigation,
    annotationRail,
    annotationRailLayout,
    handleReaderPointerDownCapture,
    navigateAnnotation,
    selectionCopyRequestKey: shellSelectionCopyRequestKey,
  } = useReaderShellState({
    activeId,
    annotationRailLayoutOverride: railLayoutOverride,
    annotationRailViewportHeight: railViewportHeight,
    annotationRailViewportTop: railViewportTop,
    annotations,
    articleId: article.id,
    articleRef,
    autoExpandNewAnnotations,
    boxes,
    canvasRef,
    commentsCloseKey,
    composer,
    filteredAnnotations,
    highlightChoice,
    noteRefs,
    readerContentWidth: readerSettings.contentWidth,
    selectionAction,
    selectionActionShortcuts,
    settingsOpen,
    surfaceRef,
    onAnnotationLayoutChange: annotationActions.onAnnotationLayoutChange,
    onCancelComposer: selectionActions.onCancelComposer,
    onClearActiveAnnotation: annotationActions.onClearActiveAnnotation,
    onClearSelection: selectionActions.onClearSelection,
    onCloseFloatingPanels: shell.onCloseFloatingPanels,
    onCloseHighlightChoice: selectionActions.onCloseHighlightChoice,
    onCloseReaderChat: chatActions?.onClose,
    onAskSelection: selectionActions.onAskSelection,
    onNavigateAnnotation: annotationActions.onNavigateAnnotation,
    onOpenReaderChat: chatActions?.onOpen,
    onOpenComposer: selectionActions.onOpenComposer,
    onResolveAnnotationNavigation: annotationActions.onResolveAnnotationNavigation,
    onToggleSettings: shell.onToggleSettings,
    readerChatOpen: chat?.open,
  });
  const {
    annotationRailItems,
    exitingAnnotationIds,
    expandedPrimaryCommentIds,
    noteRefForAnnotation,
    setPrimaryCommentExpanded,
    visibleAnnotationIds,
    visibleAnnotations,
  } = annotationRail;
  const hasToc = tocItems.length > 0;

  const style: ReaderAppStyle = {
    '--reader-font-size': `${readerSettings.fontSize}px`,
    '--reader-content-width': `${readerSettings.contentWidth}px`,
    '--reader-content-bg': readerSettings.backgroundColor,
    ...(annotationRailLayout.articleWidth
      ? { '--reader-layout-article-width': `${annotationRailLayout.articleWidth}px` }
      : {}),
  };

  return (
    <div
      className={[
        'reader-app',
        embedded ? 'is-embedded' : '',
        annotationRailLayout.mode === 'both' ? 'is-annotation-both' : '',
        annotationRailLayout.mode === 'left' ? 'is-annotation-left' : '',
        annotationRailLayout.mode === 'stacked' ? 'is-annotation-stacked' : '',
        annotationRailLayout.mode === 'right' ? 'is-annotation-right' : '',
        hasToc ? 'has-toc' : '',
        hasToc && tocOpen ? 'is-toc-open' : '',
        readerBackgroundTone(readerSettings.backgroundColor) === 'dark'
          ? 'is-reader-background-dark'
          : 'is-reader-background-light',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onPointerDownCapture={handleReaderPointerDownCapture}
    >
      <ReaderToolbar
        articleLeadingVisual={toolbar?.articleLeadingVisual}
        extracted={article.extracted}
        headerMeta={toolbar?.headerMeta}
        labels={labels}
        readingProgress={toolbar?.readingProgress}
        toolbarArticleAction={toolbar?.articleAction}
        onClose={shell.onClose}
      />

      <ReaderFloatingToolbar
        annotationNavigation={annotationNavigation}
        controls={toolbar?.controls}
        hasToc={hasToc}
        labels={labels}
        search={toolbar?.search}
        showAnnotationNavigation={Boolean(
          annotationActions.onResolveAnnotationNavigation && annotationActions.onNavigateAnnotation,
        )}
        tocOpen={tocOpen}
        onNavigateAnnotation={navigateAnnotation}
        onToggleToc={tocActions.onToggleToc}
      />

      {showSettings ? (
        <ReaderFloatingPanels
          labels={readerSettingsLabels(labels)}
          readerSettings={readerSettings}
          settingsOpen={settingsOpen}
          onUpdateReaderSettings={shell.onUpdateReaderSettings}
        />
      ) : null}

      <button
        className="reader-responsive-scrim"
        type="button"
        aria-label={labels.closeSidebar}
        onClick={shell.onCloseResponsivePanels}
      />

      <main className="reader-main">
        <ReaderTocPanel
          annotationTotals={annotationTotals}
          hasToc={hasToc}
          labels={labels}
          activeTocIndex={toc.activeIndex}
          tocAnnotationStats={toc.annotationStats}
          tocItems={tocItems}
          tocOpen={tocOpen}
          onScrollToHeading={tocActions.onScrollToHeading}
        />

        <ReaderSurfaceView
          activeId={activeId}
          agentTheaterBoxes={theaterBoxes}
          annotationRailLayout={annotationRailLayout}
          agents={agents}
          annotationRailItems={annotationRailItems}
          annotations={annotations}
          articleContent={article.content}
          articleRef={articleRef}
          boxes={boxes}
          canvasRef={canvasRef}
          commentsCloseKey={commentsCloseKey}
          chat={chat}
          composer={composer}
          distillationAnimation={distillationAnimation}
          exitingAnnotationIds={exitingAnnotationIds}
          expandedPrimaryCommentIds={expandedPrimaryCommentIds}
          extracted={article.extracted}
          highlightChoice={highlightChoice}
          labels={labels}
          messageSendShortcut={messageSendShortcut}
          newAnnotationIds={newAnnotationIds}
          noteRefForAnnotation={noteRefForAnnotation}
          notesRef={notesRef}
          selectionAction={selectionAction}
          selectionActionShortcuts={selectionActionShortcuts}
          selectionCopyRequestKey={shellSelectionCopyRequestKey + copyRequestKey}
          shortcutModifier={shortcutModifier}
          searchBoxes={searchBoxes}
          showEmptyNotes={showEmptyNotes}
          surfaceRef={surfaceRef}
          temporaryBoxes={temporaryBoxes}
          userProfile={userProfile}
          visibleAnnotationIds={visibleAnnotationIds}
          visibleAnnotations={visibleAnnotations}
          onAddComment={annotationActions.onAddComment}
          onCancelComposer={selectionActions.onCancelComposer}
          onClearSelection={selectionActions.onClearSelection}
          onCloseHighlightChoice={selectionActions.onCloseHighlightChoice}
          onCopySelection={selectionActions.onCopySelection}
          onCreateAnnotation={annotationActions.onCreateAnnotation}
          onDeleteAnnotation={annotationActions.onDeleteAnnotation}
          onDeleteComment={annotationActions.onDeleteComment}
          onFocusAnnotation={annotationActions.onFocusAnnotation}
          onOpenAnnotationDiscussion={annotationActions.onOpenAnnotationDiscussion}
          onHighlightClick={annotationActions.onHighlightClick}
          onMouseUp={selectionActions.onMouseUp}
          onAskSelection={selectionActions.onAskSelection}
          onOpenComposer={selectionActions.onOpenComposer}
          pendingAnnotationAgents={pendingAnnotationAgents}
          onPrimaryCommentExpandedChange={setPrimaryCommentExpanded}
          reviewAgents={reviewAgents}
          onScrollToHighlight={annotationActions.onScrollToHighlight}
        />
      </main>

      {activeConnection ? <AnnotationConnection connection={activeConnection} /> : null}

      <AgentReadingDock
        completionBurstKey={completionBurstKey}
        completing={dockCompleting}
        items={dockItems}
        labels={labels}
      />

      {chat && chatActions ? (
        <ReaderChatPanel
          agents={agents}
          draftContext={chat.draftContext}
          error={chat.error}
          labels={labels}
          messageSendShortcut={messageSendShortcut}
          open={chat.open}
          selectedAssistantId={chat.selectedAssistantId}
          sending={chat.sending}
          shortcutModifier={shortcutModifier}
          state={chat.state}
          onClearDraftContext={chatActions.onClearDraftContext}
          onClose={chatActions.onClose}
          onOpen={chatActions.onOpen}
          onRevealContext={chatActions.onRevealContext}
          onSelectAssistant={chatActions.onSelectAssistant}
          onSubmit={chatActions.onSubmit}
        />
      ) : null}

      {virtualCursors.map((cursor) =>
        cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
      )}
    </div>
  );
}

function readerSettingsLabels(labels: ReaderUiLabels) {
  return {
    articleWidth: labels.articleWidth,
    fontSize: labels.fontSize,
  };
}
