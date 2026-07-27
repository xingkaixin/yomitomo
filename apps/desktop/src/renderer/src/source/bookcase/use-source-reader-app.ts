import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { MessageSendShortcut, SelectionActionShortcuts } from '@yomitomo/shared';
import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import type { ReaderArticleActions } from '../../shell/app-article-store-actions';
import {
  useSourceReaderSession,
  type SourceAgentAnnotationAdapter,
  type UseSourceReaderSessionOptions,
} from './use-source-reader-session';
import { useSourceReaderWorkspace } from './use-source-reader-workspace';

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
type SourceReaderAnnotationSurface = Omit<
  ReaderAppViewProps['annotations'],
  'annotationTotals' | 'commentsCloseKey'
>;

export type SourceReaderAppSurface = {
  actions: SourceReaderActionAdapters;
  agentPlayback: SourceReaderAgentPlayback;
  annotations: SourceReaderAnnotationSurface;
  article: ReaderAppViewProps['article'];
  refs: ReaderAppViewProps['refs'];
  toc: ReaderAppViewProps['toc'];
  userProfile: ReaderAppViewProps['userProfile'];
  toolbar?: ReaderAppViewProps['toolbar'];
};

export type UseSourceReaderAppInput = {
  articleActions: ReaderArticleActions;
  canvasRef: RefObject<HTMLElement | null>;
  createAgentAnnotationAdapter?: (context: {
    setStatusMessage: Dispatch<SetStateAction<string>>;
  }) => SourceAgentAnnotationAdapter;
  getArticleText: () => string | Promise<string>;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  session: SourceReaderSessionInput;
};

export function useSourceReaderApp({
  articleActions,
  canvasRef,
  createAgentAnnotationAdapter,
  getArticleText,
  messageSendShortcut,
  selectionActionShortcuts,
  session: sessionInput,
}: UseSourceReaderAppInput) {
  const [statusMessage, setStatusMessage] = useState('');
  const session = useSourceReaderSession({
    ...sessionInput,
    agentAnnotationAdapter: createAgentAnnotationAdapter?.({ setStatusMessage }),
    getArticleText,
    onDeleteArticleAnnotation: articleActions.deleteArticleAnnotation,
    onDeleteArticleComment: articleActions.deleteArticleComment,
    onSaveArticleAnnotation: articleActions.saveArticleAnnotation,
    onSaveArticleComment: articleActions.saveArticleComment,
    setStatusMessage,
  });
  const workspace = useSourceReaderWorkspace({
    article: sessionInput.article,
    canvasRef,
    getArticleText,
    messageSendShortcut,
    selectionActionShortcuts,
    session,
    uiLanguage: sessionInput.uiLanguage,
    onSaveArticleReaderChatState: articleActions.saveArticleReaderChatState,
  });

  useEffect(() => setStatusMessage(''), [sessionInput.article.id]);

  function viewProps({
    actions: actionAdapters,
    agentPlayback,
    annotations,
    article,
    refs,
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
        commentsCloseKey: workspace.commentsCloseKey,
        ...annotations,
      },
      article,
      chat: workspace.readerChat.model,
      labels: workspace.labels,
      options: { embedded: true },
      refs,
      selection: {
        composer: workspace.selection.composer,
        copyRequestKey: workspace.selection.copyRequestKey,
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
    session,
    setStatusMessage,
    statusMessage,
    viewProps,
    workspace,
  };
}
