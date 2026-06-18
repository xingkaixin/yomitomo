import type { ReaderAppViewProps } from '@yomitomo/reader-ui/reader-app-view';

type ReaderAppActions = ReaderAppViewProps['actions'];
type ReaderAnnotationActions = ReaderAppActions['annotation'];
type ReaderChatActions = NonNullable<ReaderAppActions['chat']>;
type SourceOpenAnnotationDiscussion = (
  articleId: string,
  annotationId: string,
  sourceRect?: Parameters<NonNullable<ReaderAnnotationActions['onOpenAnnotationDiscussion']>>[1],
) => void | Promise<void>;

export type SourceReaderAppActionsInput = {
  annotation: Omit<ReaderAnnotationActions, 'onOpenAnnotationDiscussion'>;
  articleId: string;
  chat?: ReaderChatActions;
  selection: ReaderAppActions['selection'];
  shell: ReaderAppActions['shell'];
  toc: ReaderAppActions['toc'];
  onOpenAnnotationDiscussion?: SourceOpenAnnotationDiscussion;
  onRevealReaderChatContext?: ReaderChatActions['onRevealContext'];
};

export function buildSourceReaderAppActions({
  annotation,
  articleId,
  chat,
  selection,
  shell,
  toc,
  onOpenAnnotationDiscussion,
  onRevealReaderChatContext,
}: SourceReaderAppActionsInput): ReaderAppActions {
  return {
    annotation: {
      ...annotation,
      onOpenAnnotationDiscussion: (annotationId, sourceRect) =>
        void onOpenAnnotationDiscussion?.(articleId, annotationId, sourceRect),
    },
    chat: chat
      ? {
          ...chat,
          ...(onRevealReaderChatContext ? { onRevealContext: onRevealReaderChatContext } : {}),
        }
      : undefined,
    selection,
    shell,
    toc,
  };
}
