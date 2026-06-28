import type {
  Annotation,
  ArticleRecord,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  Collection,
  CollectionStorePatch,
  Comment,
  ContentRef,
  DesktopStore,
  LibraryPinTargetKind,
  ReaderChatState,
  TextSourceFormat,
  WeReadBook,
  WeReadOpenMethod,
  WeReadSyncMode,
  WeReadReadingStatsMode,
  WeReadSettings,
} from '@yomitomo/shared';
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

export type AppLockVerifyPinResult = {
  ok: boolean;
};

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

export type ArticleLibrarySource = 'web' | 'ebook' | 'pdf';

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
