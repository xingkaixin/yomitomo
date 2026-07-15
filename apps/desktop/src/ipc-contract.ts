import type {
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  Annotation,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleTranslation,
  ArticleUpsertPatch,
  AssistantRuntimeProgressEvent,
  Collection,
  CollectionStorePatch,
  Comment,
  ContentRef,
  DesktopStore,
  LibraryPinTargetKind,
  LibraryPinPatch,
  ReaderChatState,
  TextSourceFormat,
  WeReadBook,
  WeReadOpenMethod,
  WeReadSyncMode,
  WeReadReadingStatsMode,
  WeReadSettings,
} from '@yomitomo/shared';
import type { AppMenuCommand } from './app-menu-types';
import type { AppUpdateState } from './app-update-types';
import type { SerializedDesktopIpcError } from './ipc-errors';
import type {
  AgentIpcInvokeMap,
  AnnotationWindowIpcInvokeMap,
  AppIpcInvokeMap,
  AppLockIpcInvokeMap,
  ArticleIpcInvokeMap,
  DataIpcInvokeMap,
  LibraryCollectionIpcInvokeMap,
  ProviderIpcInvokeMap,
  StoreIpcInvokeMap,
  UpdateIpcInvokeMap,
  WeReadIpcInvokeMap,
} from './ipc/desktop-ipc-contract-fragments';

export type AppInfo = {
  desktopVersion: string;
};

export type AppLockStatus = {
  configured: boolean;
  enabled: boolean;
  locked: boolean;
  shortcut?: string;
};

export type AppLockSetPinInput = {
  confirmPin: string;
  pin: string;
};

export type AppLockVerifyPinInput = {
  pin: string;
};

export type AppLockVerifyPinResult =
  | { ok: true; retryAfterMs: 0; status: 'verified' }
  | { ok: false; retryAfterMs: number; status: 'blocked' | 'invalid' };

export type AppLockUnlockInput = {
  pin: string;
};

export type AppLockSetEnabledInput = {
  enabled: boolean;
  pin?: string;
};

export type AppLockSetLockedInput = {
  locked: boolean;
};

export type AppLockSetShortcutInput = {
  shortcut: string | null;
};

export type ArticleImportResult =
  | { status: 'canceled' }
  | { status: 'duplicate'; article: ArticleRecord }
  | { status: 'imported'; article: ArticleRecord; patch: ArticleUpsertPatch };

export type ArticleImportUrlInput = string | { url: string; requestId?: string };

export type ArticleAnnotationDeleteInput = {
  articleId: string;
  annotationId: string;
};

export type ArticleAnnotationUpsertInput = {
  articleId: string;
  annotation: Annotation;
  updatedAt?: string;
};

export type ArticleCommentDeleteInput = {
  articleId: string;
  annotationId: string;
  commentId: string;
};

export type ArticleCommentUpsertInput = {
  articleId: string;
  annotationId: string;
  comment: Comment;
  updatedAt?: string;
};

export type ArticleReaderChatStateSaveInput = {
  articleId: string;
  readerChatState?: ReaderChatState;
};

export type ArticleLibrarySource = 'web' | 'ebook' | 'pdf' | 'text';

export type ArticleLibrarySourceCounts = Record<ArticleLibrarySource, number>;

export type ArticleLibraryListInput = {
  source: ArticleLibrarySource;
  query?: string;
  page?: number;
  pageSize?: number;
};

export type ArticleLibraryListResult = {
  articles: ArticleSummaryRecord[];
  page: number;
  pageSize: number;
  query: string;
  source: ArticleLibrarySource;
  sourceCounts: ArticleLibrarySourceCounts;
  totalCount: number;
};

export type LibraryCatalogItemType = ArticleLibrarySource | 'weread';

export type LibraryCatalogType = LibraryCatalogItemType | 'collection';

export type LibraryCatalogScope =
  | { kind: 'library' }
  | { kind: 'collection'; collectionId: string }
  | { kind: 'picker'; collectionId: string };

export type LibraryCatalogItem = {
  kind: 'item';
  ref: ContentRef;
  type: LibraryCatalogItemType;
  sortTime: string;
  pinned: boolean;
  article?: ArticleSummaryRecord;
  weread?: WeReadBook;
};

export type LibraryCatalogCollection = {
  kind: 'col';
  collection: Collection;
  coverMembers: LibraryCatalogItem[];
  memberCount: number;
  sortTime: string;
  pinned: boolean;
};

export type LibraryCatalogEntity = LibraryCatalogItem | LibraryCatalogCollection;

export type LibraryCatalogItemCounts = Record<LibraryCatalogItemType, number>;

export type LibraryCatalogListInput = {
  scope: LibraryCatalogScope;
  types?: LibraryCatalogType[];
  query?: string;
  page?: number;
  pageSize?: number;
};

export type LibraryCatalogListResult = {
  entities: LibraryCatalogEntity[];
  itemCounts: LibraryCatalogItemCounts;
  page: number;
  pageSize: number;
  query: string;
  totalCount: number;
  unfilteredCount: number;
};

export type WindowAnimationSourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AnnotationDiscussionWindowOpenInput = {
  articleId: string;
  annotationId: string;
  sourceRect?: WindowAnimationSourceRect;
};

export type AnnotationDiscussionWindowOpenResult = {
  reused: boolean;
  windowId: number;
};

export type AnnotationSedimentationWindowOpenInput = {
  articleId: string;
  annotationId: string;
  sourceRect?: WindowAnimationSourceRect;
};

export type AnnotationSedimentationWindowOpenResult = {
  reused: boolean;
  windowId: number;
};

export type AnnotationDistillationCommitTransition = 'publish' | 'update' | 'unpublish';

export type AnnotationSedimentationCommitInput = {
  articleId: string;
  annotationId: string;
  distillation: Annotation['distillation'];
  transition: AnnotationDistillationCommitTransition;
};

export type AnnotationSedimentationCommitResult = {
  closed: number;
  minimized: number;
};

export type AnnotationDistillationCommittedEvent = AnnotationSedimentationCommitInput;

export type AnnotationDiscussionWindowState = {
  articleId: string;
  annotationId: string;
  windowId: number;
  minimized: boolean;
};

export type AnnotationDiscussionWindowStateEvent =
  | { type: 'upsert'; window: AnnotationDiscussionWindowState }
  | { type: 'remove'; articleId: string; annotationId: string; windowId: number };

export type AnnotationDiscussionWindowsCloseArticleInput = {
  articleId: string;
};

export type AnnotationDiscussionWindowsCloseArticleResult = {
  closed: number;
};

export type DataManagementPathKind = 'dataDir' | 'logFile' | 'databaseFile';

export type DataManagementPaths = {
  dataDir: string;
  logFile: string;
  databaseFile: string;
};

export type AgentRuntimeTraceTaskType =
  | 'thread_reply'
  | 'create_thought'
  | 'distillation_review'
  | 'selection_first'
  | 'co_reading_section';

export type AgentRuntimeTraceStatus =
  | 'comment'
  | 'result'
  | 'fallback'
  | 'final'
  | 'kept_without_runtime';

export type AgentRuntimeTraceListInput = {
  taskType?: AgentRuntimeTraceTaskType | 'all';
  agentId?: string;
  articleId?: string;
  failureOnly?: boolean;
  limit?: number;
};

export type AgentRuntimeTraceDecision = {
  annotationId: string;
  status: AgentRuntimeTraceStatus;
  actionType?: string;
  failureReason?: string;
};

export type AgentRuntimeTraceEntry = {
  id: string;
  at: string;
  taskType: AgentRuntimeTraceTaskType;
  agentId: string;
  articleId: string;
  status: AgentRuntimeTraceStatus;
  finalActionType?: string;
  failureReason?: string;
  stepCount: number;
  repairUsed?: boolean;
  annotationCount?: number;
  decisionCount?: number;
  filteredCount?: number;
  fallbackCount?: number;
  trace?: unknown;
  decisions?: AgentRuntimeTraceDecision[];
};

export type AssistantExecutionStatus = 'success' | 'fallback' | 'error';

export type AssistantExecutionQueryInput = {
  from: string;
  to: string;
  agentId?: string;
  providerId?: string;
  modelName?: string;
  taskType?: string;
  status?: AssistantExecutionStatus | 'all';
  requestedMode?: string;
  effectiveMode?: string;
  limit?: number;
};

export type AssistantExecutionUsage = {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
};

export type AssistantExecutionSafeStep = {
  stepIndex: number;
  eventType: string;
  toolName?: string;
  latencyMs: number;
  resultCount: number;
  failureReason?: string;
};

export type AssistantExecutionRunListItem = {
  id: string;
  createdAt: string;
  agentId: string;
  agentUsername?: string;
  agentNickname?: string;
  taskType: string;
  requestedMode: string;
  effectiveMode: string;
  providerId: string;
  providerName: string;
  modelName: string;
  status: AssistantExecutionStatus;
  fallbackReason?: string;
  usage: AssistantExecutionUsage;
  estimatedCostMicros?: number;
  currency?: string;
  durationMs?: number;
  stepCount: number;
};

export type AssistantExecutionRunDetail = {
  id: string;
  safeSteps: AssistantExecutionSafeStep[];
};

export type AssistantExecutionRun = AssistantExecutionRunListItem & AssistantExecutionRunDetail;

export type AssistantExecutionTotals = {
  runCount: number;
  successCount: number;
  fallbackCount: number;
  errorCount: number;
  usage: AssistantExecutionUsage;
  estimatedCostMicros: number;
  missingCostCount: number;
  averageDurationMs?: number;
};

export type AssistantExecutionSummaryGroup = AssistantExecutionTotals & {
  key: string;
  label: string;
};

export type AssistantExecutionSummary = {
  totals: AssistantExecutionTotals;
  byAgent: AssistantExecutionSummaryGroup[];
  byProviderModel: AssistantExecutionSummaryGroup[];
  byTaskType: AssistantExecutionSummaryGroup[];
  byMode: AssistantExecutionSummaryGroup[];
};

export type DatabaseBackupResult = { canceled: true } | { canceled: false; filePath: string };

export type DatabaseRestoreResult =
  | { canceled: true }
  | { canceled: false; backupPath: string; store: DesktopStore };

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export const MAX_EBOOK_IMPORT_BYTES = 80 * 1024 * 1024;

export type PdfImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export const MAX_PDF_IMPORT_BYTES = 120 * 1024 * 1024;

export type TextImportFileInput = {
  fileName: string;
  data: ArrayBuffer;
};

export type TextImportPrepareInput =
  | { kind: 'paste'; content: string; format: TextSourceFormat }
  | { kind: 'files'; files: TextImportFileInput[] };

export type TextImportPreparedItem =
  | {
      ok: true;
      format: TextSourceFormat;
      fileName?: string;
      suggestedTitle: string;
      suggestedAuthor?: string;
      body: string;
      frontMatter?: Record<string, string>;
    }
  | { ok: false; fileName?: string; reason: 'binary' | 'undecodable' | 'empty' };

export type TextImportPrepareResult = {
  items: TextImportPreparedItem[];
};

export type TextImportCommitItem = {
  title: string;
  author?: string;
  format: TextSourceFormat;
  body: string;
  frontMatter?: Record<string, string>;
};

export type TextImportCommitInput = {
  items: TextImportCommitItem[];
};

export type TextImportCommitResult = {
  articles: ArticleRecord[];
  patches: ArticleUpsertPatch[];
};

export const MAX_TEXT_IMPORT_BYTES = 20 * 1024 * 1024;

export type PerformanceTimingInput = {
  event: string;
  data?: Record<string, unknown>;
};

export type ProviderTestResult = {
  ok: boolean;
  message: string;
};

export type WeReadSaveSettingsInput = {
  apiKey?: string;
  removeApiKey?: boolean;
  openMethod?: WeReadOpenMethod;
  syncMode?: WeReadSyncMode;
};

export type WeReadOpenTarget = {
  bookId: string;
  chapterUid?: number;
  range?: string;
  userVid?: number;
};

export type WeReadState = {
  settings: WeReadSettings;
  books: WeReadBook[];
};

export type WeReadReadingStatsQueryInput = {
  mode: WeReadReadingStatsMode;
  baseTime?: number;
};

export type CreateCollectionInput = {
  name: string;
};

export type CreateCollectionResult = {
  collection: Collection;
  patch: CollectionStorePatch;
};

export type RenameCollectionInput = {
  collectionId: string;
  name: string;
};

export type AddCollectionMembersInput = {
  collectionId: string;
  members: ContentRef[];
};

export type RemoveCollectionMemberInput = {
  collectionId: string;
  member: ContentRef;
};

export type SetLibraryPinInput = {
  target: { kind: LibraryPinTargetKind; id: string };
  pinned: boolean;
};

export type DesktopIpcInvokeMap = AgentIpcInvokeMap &
  AnnotationWindowIpcInvokeMap &
  AppIpcInvokeMap &
  AppLockIpcInvokeMap &
  ArticleIpcInvokeMap &
  DataIpcInvokeMap &
  LibraryCollectionIpcInvokeMap &
  ProviderIpcInvokeMap &
  StoreIpcInvokeMap &
  UpdateIpcInvokeMap &
  WeReadIpcInvokeMap;

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap;

export type DesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['args'];

export type DesktopIpcInvokeResult<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['result'];

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

export type DesktopIpcToMainEventMap = {
  'app:renderer-ready': undefined;
  'agent:comment:stream': DesktopIpcStreamRequest<'agent:comment:stream'>;
  'agent:distillation-review:stream': DesktopIpcStreamRequest<'agent:distillation-review:stream'>;
  'agent:annotate:stream': DesktopIpcStreamRequest<'agent:annotate:stream'>;
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
