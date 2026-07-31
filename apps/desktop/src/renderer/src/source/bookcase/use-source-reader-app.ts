import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type {
  Annotation,
  AppSettings,
  MessageSendShortcut,
  ReaderQuestionContext,
  SelectionActionShortcuts,
} from '@yomitomo/shared';
import { createUserAnnotation } from '@yomitomo/core';
import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import type { ReaderArticleActions } from '../../shell/app-article-store-actions';
import {
  useSourceReaderSession,
  type SourceAgentAnnotationAdapter,
  type UseSourceReaderSessionOptions,
} from './use-source-reader-session';
import { useSourceReaderWorkspace } from './use-source-reader-workspace';
import { useRecentAnnotationFeedback } from './use-recent-annotation-feedback';

type ReaderAppActions = ReaderAppViewProps['actions'];
type ReaderAnnotationActions = ReaderAppActions['annotation'];
type ReaderChatActions = NonNullable<ReaderAppActions['chat']>;
type ReaderSelectionActions = ReaderAppActions['selection'];
type ReaderShellActions = ReaderAppActions['shell'];
type ReaderTocActions = ReaderAppActions['toc'];
type SourceReaderSessionInput = Omit<
  UseSourceReaderSessionOptions,
  | 'agentAnnotationAdapter'
  | 'getArticleText'
  | 'onDeleteArticleAnnotation'
  | 'onDeleteArticleComment'
  | 'onSaveArticleAnnotation'
  | 'onSaveArticleComment'
  | 'onOpenAnnotation'
  | 'setStatusMessage'
> & {
  onOpenAnnotation?: (annotationId: string | null) => void;
};

type SourceReaderLifecycleObserver = {
  onAskSelection?: (anchor: Annotation['anchor']) => void;
  onBeforeCreateAnnotation?: (note: string, anchor: Annotation['anchor']) => void;
  onCancelComposer?: () => void;
  onClearSelection?: () => void;
  onOpenComposer?: (action: Parameters<ReaderSelectionActions['onOpenComposer']>[0]) => void;
};

export type SourceReaderAdapter = {
  lifecycle?: SourceReaderLifecycleObserver;
  navigation: Pick<
    ReaderAnnotationActions,
    'onNavigateAnnotation' | 'onResolveAnnotationNavigation' | 'onScrollToHighlight'
  > & {
    onScrollToHeading: ReaderTocActions['onScrollToHeading'];
  };
  onHighlightClick: ReaderAnnotationActions['onHighlightClick'];
  onRevealReaderChatContext?: ReaderChatActions['onRevealContext'];
  questionContext: (anchor: Annotation['anchor']) => ReaderQuestionContext;
  selection?: Pick<
    ReaderSelectionActions,
    | 'onMouseUp'
    | 'onSelectionHandleDrag'
    | 'onSelectionHandleDragEnd'
    | 'onSelectionHandleDragStart'
  >;
};

type SourceReaderAgentPlayback = Omit<
  ReaderAppViewProps['agents'],
  'agents' | 'pendingAnnotationAgents' | 'reviewAgents'
>;
type SourceReaderAnnotationSurface = Omit<ReaderAppViewProps['annotations'], 'annotationTotals'>;

export type SourceReaderAppSurface = {
  adapter: SourceReaderAdapter;
  agentPlayback: SourceReaderAgentPlayback;
  annotations: SourceReaderAnnotationSurface;
  article: ReaderAppViewProps['article'];
  onAnnotationLayoutChange?: ReaderAnnotationActions['onAnnotationLayoutChange'];
  shell: {
    onClose: ReaderShellActions['onClose'];
    onCloseFloatingPanels?: ReaderShellActions['onCloseFloatingPanels'];
    onCloseResponsivePanels?: ReaderShellActions['onCloseResponsivePanels'];
    onToggleSettings?: ReaderShellActions['onToggleSettings'];
    settingsOpen?: boolean;
    showSettings?: boolean;
  };
  toc: Omit<ReaderAppViewProps['toc'], 'open'> & {
    onClose?: () => void;
    onToggle?: ReaderTocActions['onToggleToc'];
    open?: boolean;
  };
  userProfile: ReaderAppViewProps['userProfile'];
  toolbar?: ReaderAppViewProps['toolbar'];
};

export type UseSourceReaderAppInput = {
  articleActions: ReaderArticleActions;
  canvasRef: RefObject<HTMLElement | null>;
  createAgentAnnotationAdapter?: (context: {
    isCurrentArticle: (articleId: string) => boolean;
    setStatusMessage: Dispatch<SetStateAction<string>>;
  }) => SourceAgentAnnotationAdapter;
  getArticleText: () => string | Promise<string>;
  beforeOpenAnnotation?: () => void;
  messageSendShortcut?: MessageSendShortcut;
  onRequestSelectionCopy: () => void;
  settings?: AppSettings;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  session: SourceReaderSessionInput;
};

export function useSourceReaderApp({
  articleActions,
  beforeOpenAnnotation,
  canvasRef,
  createAgentAnnotationAdapter,
  getArticleText,
  messageSendShortcut,
  onRequestSelectionCopy,
  settings,
  selectionActionShortcuts,
  session: sessionInput,
}: UseSourceReaderAppInput) {
  const [statusMessage, setStatusMessage] = useState('');
  const [tocOpen, setTocOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const session = useSourceReaderSession({
    ...sessionInput,
    agentAnnotationAdapter: createAgentAnnotationAdapter?.({
      isCurrentArticle,
      setStatusMessage,
    }),
    getArticleText,
    onDeleteArticleAnnotation: articleActions.deleteArticleAnnotation,
    onDeleteArticleComment: articleActions.deleteArticleComment,
    onSaveArticleAnnotation: articleActions.saveArticleAnnotation,
    onSaveArticleComment: articleActions.saveArticleComment,
    onOpenAnnotation: sessionInput.onOpenAnnotation
      ? (annotationId) => openAnnotation(annotationId)
      : undefined,
    setStatusMessage,
  });
  const workspace = useSourceReaderWorkspace({
    article: sessionInput.article,
    canvasRef,
    getArticleText,
    messageSendShortcut,
    onRequestSelectionCopy,
    selectionActionShortcuts,
    session,
    uiLanguage: sessionInput.uiLanguage,
    onSaveArticleReaderChatState: articleActions.saveArticleReaderChatState,
  });
  const { markAnnotationCreated, newAnnotationIds } = useRecentAnnotationFeedback(
    sessionInput.article.id,
    settings,
  );

  useEffect(() => {
    setSettingsOpen(false);
    setStatusMessage('');
    setTocOpen(false);
  }, [sessionInput.article.id]);

  function isCurrentArticle(articleId: string) {
    return sessionInput.article.id === articleId;
  }

  function openAnnotation(annotationId: string) {
    beforeOpenAnnotation?.();
    sessionInput.onOpenAnnotation?.(annotationId);
  }

  async function createAnnotation(note: string) {
    const composer = workspace.selection.composer;
    if (!composer) return;
    workspace.selection.cancelComposer();
    const annotation = createUserAnnotation(composer.anchor, sessionInput.userProfile, note);
    await session.saveAnnotation(annotation);
    markAnnotationCreated(annotation.id);
    openAnnotation(annotation.id);
  }

  function askSelection(
    action: { anchor: Annotation['anchor'] },
    questionContext: (anchor: Annotation['anchor']) => ReaderQuestionContext,
  ) {
    workspace.readerChat.askSelection(questionContext(action.anchor));
    workspace.selection.clearSelection();
  }

  function closeSettings() {
    setSettingsOpen(false);
  }

  function closeToc() {
    setTocOpen(false);
  }

  function toggleSettings() {
    setSettingsOpen((open) => !open);
  }

  function toggleToc() {
    setTocOpen((open) => !open);
  }

  function viewProps({
    adapter,
    agentPlayback,
    annotations,
    article,
    onAnnotationLayoutChange,
    shell,
    toc,
    toolbar,
    userProfile,
  }: SourceReaderAppSurface): ReaderAppViewProps {
    const activeTocOpen = toc.open ?? tocOpen;
    const closeReaderToc = toc.onClose ?? closeToc;
    const actions: ReaderAppActions = {
      annotation: {
        onAnnotationLayoutChange,
        onClearActiveAnnotation: () => sessionInput.onOpenAnnotation?.(null),
        onCreateAnnotation: async (note) => {
          const composer = workspace.selection.composer;
          if (composer) adapter.lifecycle?.onBeforeCreateAnnotation?.(note, composer.anchor);
          await createAnnotation(note);
        },
        onDeleteAnnotation: session.deleteAnnotation,
        onFocusAnnotation: openAnnotation,
        onHighlightClick: adapter.onHighlightClick,
        onNavigateAnnotation: adapter.navigation.onNavigateAnnotation,
        onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
          void articleActions.openArticleDiscussion(
            sessionInput.article.id,
            annotationId,
            sourceRect,
          ),
        onResolveAnnotationNavigation: adapter.navigation.onResolveAnnotationNavigation,
        onScrollToHighlight: adapter.navigation.onScrollToHighlight,
      },
      chat: {
        ...workspace.readerChat.actions,
        ...(adapter.onRevealReaderChatContext
          ? { onRevealContext: adapter.onRevealReaderChatContext }
          : {}),
      },
      selection: {
        onAskSelection: (action) => {
          adapter.lifecycle?.onAskSelection?.(action.anchor);
          askSelection(action, adapter.questionContext);
        },
        onCancelComposer: () => {
          adapter.lifecycle?.onCancelComposer?.();
          workspace.selection.cancelComposer();
        },
        onClearSelection: () => {
          adapter.lifecycle?.onClearSelection?.();
          workspace.selection.clearSelection();
        },
        onCloseHighlightChoice: () => workspace.selection.setHighlightChoice(null),
        onCopySelection: workspace.selection.copySelection,
        onMouseUp: adapter.selection?.onMouseUp ?? (() => undefined),
        onOpenComposer: (action) => {
          adapter.lifecycle?.onOpenComposer?.(action);
          workspace.selection.openComposer(action);
        },
        ...adapter.selection,
      },
      shell: {
        onClose: shell.onClose,
        onCloseFloatingPanels: shell.onCloseFloatingPanels ?? closeSettings,
        onCloseResponsivePanels: shell.onCloseResponsivePanels ?? closeReaderToc,
        onToggleSettings: shell.onToggleSettings ?? toggleSettings,
        onUpdateReaderSettings: workspace.updateReaderSettings,
      },
      toc: {
        onScrollToHeading: adapter.navigation.onScrollToHeading,
        onToggleToc: toc.onToggle ?? toggleToc,
      },
    };

    return {
      actions,
      agents: {
        agents: session.annotationAgents,
        pendingAnnotationAgents: session.pendingAnnotationAgents,
        reviewAgents: session.reviewAgents,
        ...agentPlayback,
      },
      annotations: {
        annotationTotals: workspace.annotationTotals,
        ...annotations,
      },
      article,
      chat: workspace.readerChat.model,
      labels: workspace.labels,
      options: { embedded: true },
      selection: {
        composer: workspace.selection.composer,
        highlightChoice: workspace.selection.highlightChoice,
        selectionAction: workspace.selection.selectionAction,
      },
      settings: {
        messageSendShortcut: workspace.sendShortcut,
        readerSettings: workspace.readerSettings,
        selectionActionShortcuts: workspace.actionShortcuts,
        settingsOpen: shell.settingsOpen ?? settingsOpen,
        shortcutModifier: workspace.shortcutModifier,
        showSettings: shell.showSettings ?? false,
      },
      toc: {
        ...toc,
        open: activeTocOpen,
      },
      toolbar,
      userProfile,
    };
  }

  return {
    askSelection,
    closeSettings,
    closeToc,
    createAnnotation,
    isCurrentArticle,
    newAnnotationIds,
    openAnnotation,
    session,
    setStatusMessage,
    statusMessage,
    toggleSettings,
    toggleToc,
    viewProps,
    workspace,
  };
}
