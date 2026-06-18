import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';
import type { useSourceReaderSession } from './use-source-reader-session';
import type { useSourceReaderWorkspace } from './use-source-reader-workspace';

type SourceReaderSessionModel = Pick<
  ReturnType<typeof useSourceReaderSession>,
  'annotationAgents' | 'pendingAnnotationAgents' | 'reviewAgents'
>;
type SourceReaderWorkspaceModel = Pick<
  ReturnType<typeof useSourceReaderWorkspace>,
  | 'actionShortcuts'
  | 'annotationTotals'
  | 'commentsCloseKey'
  | 'labels'
  | 'readerChat'
  | 'readerSettings'
  | 'selection'
  | 'sendShortcut'
  | 'shortcutModifier'
>;
type SourceReaderAgentPlayback = Omit<
  ReaderAppViewProps['agents'],
  'agents' | 'pendingAnnotationAgents' | 'reviewAgents'
>;
type SourceReaderAnnotationInput = Omit<
  ReaderAppViewProps['annotations'],
  'annotationTotals' | 'commentsCloseKey'
>;

export type SourceReaderAppViewPropsInput = {
  actions: ReaderAppViewProps['actions'];
  agentPlayback: SourceReaderAgentPlayback;
  annotations: SourceReaderAnnotationInput;
  article: ReaderAppViewProps['article'];
  refs: ReaderAppViewProps['refs'];
  session: SourceReaderSessionModel;
  toc: ReaderAppViewProps['toc'];
  userProfile: ReaderAppViewProps['userProfile'];
  workspace: SourceReaderWorkspaceModel;
  toolbar?: ReaderAppViewProps['toolbar'];
};

export function buildSourceReaderAppViewProps({
  actions,
  agentPlayback,
  annotations,
  article,
  refs,
  session,
  toc,
  toolbar,
  userProfile,
  workspace,
}: SourceReaderAppViewPropsInput): ReaderAppViewProps {
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
