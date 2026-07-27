import React from 'react';
import { AgentReadingDock } from '../agent/reader-agent-reading-dock';
import { AnnotationConnection } from '../annotations/reader-annotation-connection';
import { ReaderChatPanel } from './reader-chat-panel';
import { ReaderFloatingPanels } from './reader-floating-panels';
import { ReaderSurfaceView } from './reader-surface-view';
import { ReaderTocPanel } from './reader-toc-panel';
import { ReaderFloatingToolbar, ReaderToolbar } from './reader-toolbar';
import { VirtualCursor } from './reader-virtual-cursor';
import type {
  ReaderAppViewProps,
  ReaderChatActivationSource,
  ReaderSurfaceHandle,
  ReaderUiLabels,
  SelectionAction,
} from './reader-app-view-types';
import { defaultReaderUiLabels } from './reader-app-view-types';
import { readerBackgroundTone } from '../reader-settings';
import { ReaderTooltipProvider } from '../shared/reader-component-primitives';
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
  ReaderSurfaceHandle,
  ReaderUiLabels,
  SelectionAdjustmentHandle,
  SelectionAdjustmentPointer,
  SelectionAction,
} from './reader-app-view-types';

function ReaderAppViewComponent(
  {
    actions,
    agents: agentModel,
    annotations: annotationModel,
    article,
    chat,
    labels = defaultReaderUiLabels,
    options,
    selection,
    settings,
    toc,
    toolbar,
    userProfile,
  }: ReaderAppViewProps,
  surfaceHandleRef: React.ForwardedRef<ReaderSurfaceHandle>,
) {
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
    boxes,
    filteredAnnotations,
    railLayoutOverride,
  } = annotationModel;
  const { agents, dockCompleting, dockItems, virtualCursors } = agentModel;
  const {
    messageSendShortcut,
    readerSettings,
    selectionActionShortcuts,
    settingsOpen,
    shortcutModifier,
    showSettings = true,
  } = settings;
  const { composer, highlightChoice, selectionAction } = selection;
  const articleRef = React.useRef<HTMLElement | null>(null);
  const canvasRef = React.useRef<HTMLDivElement | null>(null);
  const noteRefs = React.useRef(new Map<string, HTMLElement>());
  const notesRef = React.useRef<HTMLElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const surfaceRefs = React.useMemo(() => ({ articleRef, canvasRef, notesRef, surfaceRef }), []);
  const { embedded = false } = options ?? {};
  const tocOpen = toc.open;
  const tocItems = toc.items;
  const [chatActivationSource, setChatActivationSource] =
    React.useState<ReaderChatActivationSource>('pointer');
  const openReaderChat = React.useCallback(
    (source: ReaderChatActivationSource) => {
      setChatActivationSource(source);
      chatActions?.onOpen();
    },
    [chatActions],
  );
  const closeReaderChat = React.useCallback(
    (source: ReaderChatActivationSource) => {
      setChatActivationSource(source);
      chatActions?.onClose();
    },
    [chatActions],
  );
  const askSelection = React.useCallback(
    (action: SelectionAction, source: ReaderChatActivationSource) => {
      setChatActivationSource(source);
      selectionActions.onAskSelection?.(action);
    },
    [selectionActions],
  );
  const {
    annotationNavigation,
    annotationRail,
    annotationRailLayout,
    handleReaderPointerDownCapture,
    navigateAnnotation,
    requestSelectionCopy,
    selectionCopyRequestKey: shellSelectionCopyRequestKey,
  } = useReaderShellState({
    activeId,
    annotationRailLayoutOverride: railLayoutOverride,
    annotations,
    articleId: article.id,
    articleRef,
    boxes,
    canvasRef,
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
    onCloseReaderChat: chatActions ? closeReaderChat : undefined,
    onAskSelection: selectionActions.onAskSelection ? askSelection : undefined,
    onNavigateAnnotation: annotationActions.onNavigateAnnotation,
    onOpenReaderChat: chatActions ? openReaderChat : undefined,
    onOpenComposer: selectionActions.onOpenComposer,
    onResolveAnnotationNavigation: annotationActions.onResolveAnnotationNavigation,
    onToggleSettings: shell.onToggleSettings,
    readerChatOpen: chat?.open,
  });
  React.useImperativeHandle(
    surfaceHandleRef,
    () => ({
      getArticleElement: () => articleRef.current,
      getCanvasElement: () => canvasRef.current,
      getNoteElement: (annotationId) => noteRefs.current.get(annotationId) ?? null,
      getNoteElements: () => Array.from(noteRefs.current.values()),
      getRailElement: () => notesRef.current,
      getRootElement: () => rootRef.current,
      getViewportElement: () => surfaceRef.current,
      requestSelectionCopy,
    }),
    [requestSelectionCopy],
  );
  const surfaceActions = React.useMemo(
    () => ({
      annotation: annotationActions,
      selection: {
        ...selectionActions,
        onAskSelection: (action: SelectionAction) => askSelection(action, 'pointer'),
      },
    }),
    [annotationActions, askSelection, selectionActions],
  );
  const surfaceSelection = React.useMemo(
    () => ({
      ...selection,
      copyRequestKey: shellSelectionCopyRequestKey,
    }),
    [selection, shellSelectionCopyRequestKey],
  );
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
    <ReaderTooltipProvider>
      <div
        ref={rootRef}
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
            annotationActions.onResolveAnnotationNavigation &&
            annotationActions.onNavigateAnnotation,
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
            actions={surfaceActions}
            agents={agentModel}
            annotationRail={annotationRail}
            annotationRailLayout={annotationRailLayout}
            annotations={annotationModel}
            article={article}
            chatAvailable={Boolean(chat)}
            labels={labels}
            refs={surfaceRefs}
            selection={surfaceSelection}
            settings={settings}
            userProfile={userProfile}
          />
        </main>

        {activeConnection ? <AnnotationConnection connection={activeConnection} /> : null}

        <AgentReadingDock completing={dockCompleting} items={dockItems} labels={labels} />

        {chat && chatActions ? (
          <ReaderChatPanel
            activationSource={chatActivationSource}
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
            onClose={closeReaderChat}
            onOpen={openReaderChat}
            onRevealContext={chatActions.onRevealContext}
            onSelectAssistant={chatActions.onSelectAssistant}
            onSubmit={chatActions.onSubmit}
          />
        ) : null}

        {virtualCursors.map((cursor) =>
          cursor.visible ? <VirtualCursor cursor={cursor} key={cursor.id} /> : null,
        )}
      </div>
    </ReaderTooltipProvider>
  );
}

export const ReaderAppView = React.forwardRef(ReaderAppViewComponent);
ReaderAppView.displayName = 'ReaderAppView';

function readerSettingsLabels(labels: ReaderUiLabels) {
  return {
    articleWidth: labels.articleWidth,
    fontSize: labels.fontSize,
  };
}
