import type {
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  ArticleStorePatch,
  ArticleTranslation,
  AssistantRuntimeProgressEvent,
  CollectionStorePatch,
  Comment,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import type { AppMenuCommand } from './app-menu-types';
import type { AppUpdateState } from './app-update-types';
import type { SerializedDesktopIpcError } from './ipc-errors';
import type {
  AnnotationDiscussionWindowStateEvent,
  AnnotationDistillationCommittedEvent,
  WeReadState,
} from './ipc/desktop-ipc-domain';
export {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  MAX_TEXT_IMPORT_BYTES,
} from './ipc/article-import-boundary';
export * from './ipc/desktop-ipc-domain';
export * from './ipc/desktop-ipc-invoke-contract';

export type DesktopIpcStreamErrorEvent = {
  type: 'error';
  message: string;
  error?: SerializedDesktopIpcError;
};

type AgentCommentStreamEvent =
  | { type: 'start'; comment: Comment }
  | { type: 'delta'; delta: string }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
  | { type: 'done'; comment: Comment }
  | DesktopIpcStreamErrorEvent;

type AgentDistillationReviewStreamEvent =
  | { type: 'start'; message: AnnotationDistillationReviewMessage }
  | { type: 'delta'; delta: string }
  | { type: 'item'; item: AnnotationDistillationReviewItem }
  | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
  | { type: 'done'; message: AnnotationDistillationReviewMessage }
  | DesktopIpcStreamErrorEvent;

type AgentAnnotateStreamEvent =
  | { type: 'start' }
  | { type: 'item'; annotation: ArticleRecord['annotations'][number] }
  | {
      type: 'done';
      annotations: ArticleRecord['annotations'];
      readingMemory?: AgentAnnotateResult['readingMemory'];
    }
  | DesktopIpcStreamErrorEvent;

export type DesktopIpcStreamMap = {
  'agent:comment:stream': {
    payload: AgentMessagePayload;
    event: AgentCommentStreamEvent;
    result: Comment;
  };
  'agent:distillation-review:stream': {
    payload: AgentDistillationReviewPayload;
    event: AgentDistillationReviewStreamEvent;
    result: AnnotationDistillationReviewMessage;
  };
  'agent:annotate:stream': {
    payload: AgentAnnotatePayload;
    event: AgentAnnotateStreamEvent;
    result: AgentAnnotateResult;
  };
};

export type DesktopIpcStreamChannel = keyof DesktopIpcStreamMap;

export type DesktopIpcStreamPayload<Channel extends DesktopIpcStreamChannel> =
  DesktopIpcStreamMap[Channel]['payload'];

export type DesktopIpcStreamEvent<Channel extends DesktopIpcStreamChannel> =
  DesktopIpcStreamMap[Channel]['event'];

export type DesktopIpcStreamProgressEvent<Channel extends DesktopIpcStreamChannel> = Exclude<
  DesktopIpcStreamEvent<Channel>,
  { type: 'done' | 'error' }
>;

export type DesktopIpcStreamDoneEvent<Channel extends DesktopIpcStreamChannel> = Extract<
  DesktopIpcStreamEvent<Channel>,
  { type: 'done' }
>;

export type DesktopIpcStreamResult<Channel extends DesktopIpcStreamChannel> =
  DesktopIpcStreamMap[Channel]['result'];

export type DesktopIpcStreamRequest<Channel extends DesktopIpcStreamChannel> = {
  requestId: string;
  payload: DesktopIpcStreamPayload<Channel>;
};

export type DesktopIpcStreamResponseChannel<Channel extends DesktopIpcStreamChannel> =
  `${Channel}:${string}`;

type DesktopIpcStreamRequestMap = {
  [Channel in DesktopIpcStreamChannel]: DesktopIpcStreamRequest<Channel>;
};

export type DesktopIpcStreamCancelRequest = {
  channel: DesktopIpcStreamChannel;
  requestId: string;
};

export type DesktopIpcToMainEventMap = DesktopIpcStreamRequestMap & {
  'app:renderer-ready': undefined;
  'agent:stream-cancel': DesktopIpcStreamCancelRequest;
};

export type DesktopIpcToRendererEventMap = {
  'app-menu:command': AppMenuCommand;
  'store:updated': DesktopStore;
  'annotation-discussion:window-state': AnnotationDiscussionWindowStateEvent;
  'annotation-distillation:committed': AnnotationDistillationCommittedEvent;
  'annotation-window:closing': undefined;
  'updates:status': AppUpdateState;
  'article:patched': ArticleStorePatch;
  'article-translation:updated': ArticleTranslation;
  'collection:patched': CollectionStorePatch;
  'library-pin:patched': LibraryPinPatch;
  'weread:state-updated': WeReadState;
};

export type DesktopIpcEventMap = DesktopIpcToMainEventMap & DesktopIpcToRendererEventMap;

export type DesktopIpcEventChannel = keyof DesktopIpcEventMap;
export type DesktopIpcToMainEventChannel = keyof DesktopIpcToMainEventMap;
export type DesktopIpcToRendererEventChannel = keyof DesktopIpcToRendererEventMap;

type DesktopIpcEventArgs<Payload> = [Payload] extends [undefined] ? [] : [payload: Payload];

export type DesktopIpcToMainEventArgs<Channel extends DesktopIpcToMainEventChannel> =
  DesktopIpcEventArgs<DesktopIpcToMainEventMap[Channel]>;

export type DesktopIpcToRendererEventArgs<Channel extends DesktopIpcToRendererEventChannel> =
  DesktopIpcEventArgs<DesktopIpcToRendererEventMap[Channel]>;
