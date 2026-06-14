import { useCallback, useMemo, useState, type RefObject } from 'react';
import type {
  Annotation,
  ArticleRecord,
  MessageSendShortcut,
  PublicAgent,
  ReaderChatState,
  SelectionActionShortcuts,
  UiLanguage,
} from '@yomitomo/shared';
import { normalizeMessageSendShortcut, normalizeSelectionActionShortcuts } from '@yomitomo/shared';
import { articlePublishedDistillationCount } from '@yomitomo/core';
import { getShortcutModifier } from '@yomitomo/reader-ui/reader-shortcuts';
import { readerUiLabels } from '../../i18n/app-i18n-labels';
import { useDesktopReaderSettings } from '../../settings/app-reader-settings';
import { useReaderChatSession } from './use-reader-chat-session';
import { useSourceSelectionComposer } from './use-source-selection-composer';

type SourceReaderWorkspaceSession = {
  annotationAgents: PublicAgent[];
  annotations: Annotation[];
};

type UseSourceReaderWorkspaceInput = {
  article: ArticleRecord;
  canvasRef: RefObject<HTMLElement | null>;
  getArticleText: () => string | Promise<string>;
  messageSendShortcut?: MessageSendShortcut;
  selectionActionShortcuts?: Partial<SelectionActionShortcuts>;
  session: SourceReaderWorkspaceSession;
  uiLanguage?: UiLanguage;
  onSaveArticleReaderChatState?: (articleId: string, readerChatState?: ReaderChatState) => unknown;
};

export function useSourceReaderWorkspace({
  article,
  canvasRef,
  getArticleText,
  messageSendShortcut,
  selectionActionShortcuts,
  session,
  uiLanguage,
  onSaveArticleReaderChatState,
}: UseSourceReaderWorkspaceInput) {
  const [commentsCloseKey, setCommentsCloseKey] = useState(0);
  const closeFloatingComments = useCallback(() => setCommentsCloseKey((key) => key + 1), []);
  const selection = useSourceSelectionComposer({
    canvasRef,
    onOpenComposer: closeFloatingComments,
  });
  const [readerSettings, updateReaderSettings] = useDesktopReaderSettings();
  const readerChat = useReaderChatSession({
    agents: session.annotationAgents,
    article,
    getArticleText,
    uiLanguage,
    onSaveArticleReaderChatState,
  });
  const annotationTotals = useMemo(
    () => ({
      annotations: session.annotations.length,
      distillations: articlePublishedDistillationCount(session.annotations),
    }),
    [session.annotations],
  );
  const actionShortcuts = useMemo(
    () => normalizeSelectionActionShortcuts(selectionActionShortcuts),
    [selectionActionShortcuts],
  );

  return {
    actionShortcuts,
    annotationTotals,
    closeFloatingComments,
    commentsCloseKey,
    labels: readerUiLabels(),
    readerChat,
    readerSettings,
    selection,
    sendShortcut: normalizeMessageSendShortcut(messageSendShortcut),
    shortcutModifier: getShortcutModifier(),
    updateReaderSettings,
  };
}
