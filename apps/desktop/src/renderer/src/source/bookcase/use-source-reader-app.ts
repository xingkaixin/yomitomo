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
type SourceReaderSessionInput = Omit<
  UseSourceReaderSessionOptions,
  | 'agentAnnotationAdapter'
  | 'getArticleText'
  | 'onDeleteArticleAnnotation'
  | 'onDeleteArticleComment'
  | 'onSaveArticleAnnotation'
  | 'onSaveArticleComment'
  | 'setStatusMessage'
>;

type SourceReaderActionAdapters = {
  annotation: Omit<ReaderAnnotationActions, 'onOpenAnnotationDiscussion'>;
  selection: ReaderAppActions['selection'];
  shell: ReaderAppActions['shell'];
  toc: ReaderAppActions['toc'];
  onRevealReaderChatContext?: ReaderChatActions['onRevealContext'];
};

type SourceReaderAgentPlayback = Omit<
  ReaderAppViewProps['agents'],
  'agents' | 'pendingAnnotationAgents' | 'reviewAgents'
>;
type SourceReaderAnnotationSurface = Omit<ReaderAppViewProps['annotations'], 'annotationTotals'>;

export type SourceReaderAppSurface = {
  actions: SourceReaderActionAdapters;
  agentPlayback: SourceReaderAgentPlayback;
  annotations: SourceReaderAnnotationSurface;
  article: ReaderAppViewProps['article'];
  toc: ReaderAppViewProps['toc'];
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

  useEffect(() => setStatusMessage(''), [sessionInput.article.id]);

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

  function viewProps({
    actions: actionAdapters,
    agentPlayback,
    annotations,
    article,
    toc,
    toolbar,
    userProfile,
  }: SourceReaderAppSurface): ReaderAppViewProps {
    const actions: ReaderAppActions = {
      annotation: {
        ...actionAdapters.annotation,
        onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
          void articleActions.openArticleDiscussion(
            sessionInput.article.id,
            annotationId,
            sourceRect,
          ),
      },
      chat: {
        ...workspace.readerChat.actions,
        ...(actionAdapters.onRevealReaderChatContext
          ? { onRevealContext: actionAdapters.onRevealReaderChatContext }
          : {}),
      },
      selection: actionAdapters.selection,
      shell: actionAdapters.shell,
      toc: actionAdapters.toc,
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
        settingsOpen: false,
        shortcutModifier: workspace.shortcutModifier,
        showSettings: false,
      },
      toc,
      toolbar,
      userProfile,
    };
  }

  return {
    askSelection,
    createAnnotation,
    isCurrentArticle,
    newAnnotationIds,
    openAnnotation,
    session,
    setStatusMessage,
    statusMessage,
    viewProps,
    workspace,
  };
}
