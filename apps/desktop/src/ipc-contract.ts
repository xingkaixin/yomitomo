import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AgentMentionInstructionPayload,
  AgentMentionRoutePlan,
  AgentReviewPayload,
  Annotation,
  AnnotationDistillationReviewMessage,
  AppSettings,
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
  ArticleUpsertPatch,
  Comment,
  DesktopStore,
  LlmProvider,
  ProviderModel,
  ReaderChatState,
  UiLanguage,
  UserFacingReleaseNote,
  UserProfile,
  WeReadBook,
  WeReadBookDetail,
  WeReadOpenMethod,
  WeReadReadingStatsMode,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadSyncResult,
} from '@yomitomo/shared';
import type { DesktopStoreGetResult } from './app-store-errors';
import type { AppUpdateState } from './app-update-types';

export type AppInfo = {
  desktopVersion: string;
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

export type AssistantExecutionRun = {
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
  safeSteps: AssistantExecutionSafeStep[];
};

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
  openMethod: WeReadOpenMethod;
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

export type DesktopIpcInvokeMap = {
  'agent:annotate': {
    args: [payload: AgentAnnotatePayload];
    result: AgentAnnotateResult;
  };
  'agent:comment': {
    args: [payload: AgentMessagePayload];
    result: Comment;
  };
  'agent:delete': {
    args: [id: string];
    result: DesktopStore;
  };
  'agent:distillation-review': {
    args: [payload: AgentDistillationReviewPayload];
    result: AnnotationDistillationReviewMessage;
  };
  'agent:mention-route': {
    args: [payload: AgentMentionInstructionPayload];
    result: AgentMentionRoutePlan;
  };
  'agent:review': {
    args: [payload: AgentReviewPayload];
    result: Comment[];
  };
  'agent:save': {
    args: [agent: Partial<Agent>];
    result: DesktopStore;
  };
  'agent-trace:clear': {
    args: [];
    result: void;
  };
  'agent-trace:list': {
    args: [input?: AgentRuntimeTraceListInput];
    result: AgentRuntimeTraceEntry[];
  };
  'agent-trace:path': {
    args: [];
    result: string;
  };
  'assistant-executions:list': {
    args: [input: AssistantExecutionQueryInput];
    result: AssistantExecutionRun[];
  };
  'assistant-executions:summary': {
    args: [input: AssistantExecutionQueryInput];
    result: AssistantExecutionSummary;
  };
  'annotation-discussion:open': {
    args: [input: AnnotationDiscussionWindowOpenInput];
    result: AnnotationDiscussionWindowOpenResult;
  };
  'annotation-discussion:close-article': {
    args: [input: AnnotationDiscussionWindowsCloseArticleInput];
    result: AnnotationDiscussionWindowsCloseArticleResult;
  };
  'annotation-sedimentation:open': {
    args: [input: AnnotationSedimentationWindowOpenInput];
    result: AnnotationSedimentationWindowOpenResult;
  };
  'annotation-sedimentation:commit': {
    args: [input: AnnotationSedimentationCommitInput];
    result: AnnotationSedimentationCommitResult;
  };
  'app:info': {
    args: [];
    result: AppInfo;
  };
  'article:delete': {
    args: [id: string];
    result: ArticleDeletePatch;
  };
  'article:delete-annotation': {
    args: [input: ArticleAnnotationDeleteInput];
    result: ArticleUpsertPatch | null;
  };
  'article:delete-comment': {
    args: [input: ArticleCommentDeleteInput];
    result: ArticleUpsertPatch | null;
  };
  'article:save-annotation': {
    args: [input: ArticleAnnotationUpsertInput];
    result: ArticleUpsertPatch | null;
  };
  'article:save-comment': {
    args: [input: ArticleCommentUpsertInput];
    result: ArticleUpsertPatch | null;
  };
  'article:get': {
    args: [id: string];
    result: ArticleRecord | null;
  };
  'article:get-cover': {
    args: [id: string];
    result: string;
  };
  'article:get-site-icon': {
    args: [id: string];
    result: string;
  };
  'article:import-url': {
    args: [input: ArticleImportUrlInput];
    result: ArticleImportResult;
  };
  'article:import-url-cancel': {
    args: [requestId: string];
    result: boolean;
  };
  'article:reading-progress': {
    args: [input: { articleId: string; progress: ArticleReadingProgress }];
    result: ArticleReadingProgressPatch;
  };
  'article:reader-chat-state': {
    args: [input: ArticleReaderChatStateSaveInput];
    result: ArticleReaderChatStatePatch;
  };
  'article:save': {
    args: [article: ArticleRecord];
    result: ArticleUpsertPatch;
  };
  'data:database-backup': {
    args: [];
    result: DatabaseBackupResult;
  };
  'data:database-restore': {
    args: [];
    result: DatabaseRestoreResult;
  };
  'data:open-path': {
    args: [kind: DataManagementPathKind];
    result: void;
  };
  'data:paths': {
    args: [];
    result: DataManagementPaths;
  };
  'ebook:import-file': {
    args: [input: EbookImportFileInput];
    result: ArticleImportResult;
  };
  'ebook:read-file': {
    args: [articleId: string];
    result: ArrayBuffer;
  };
  'pdf:import-file': {
    args: [input: PdfImportFileInput];
    result: ArticleImportResult;
  };
  'pdf:read-file': {
    args: [articleId: string];
    result: ArrayBuffer;
  };
  'pdf:get-thumbnail': {
    args: [articleId: string];
    result: string;
  };
  'log:clear': {
    args: [];
    result: void;
  };
  'log:path': {
    args: [];
    result: string;
  };
  'log:read': {
    args: [];
    result: string;
  };
  'performance:timing': {
    args: [input: PerformanceTimingInput];
    result: void;
  };
  'provider:delete': {
    args: [id: string];
    result: DesktopStore;
  };
  'provider:list-models': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderModel[];
  };
  'provider:read-api-key': {
    args: [providerId: string];
    result: string;
  };
  'provider:save': {
    args: [provider: Partial<LlmProvider> & { removeApiKey?: boolean }];
    result: DesktopStore;
  };
  'provider:test': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderTestResult;
  };
  'settings:save': {
    args: [settings: AppSettings];
    result: DesktopStore;
  };
  'store:get': {
    args: [];
    result: DesktopStoreGetResult;
  };
  'updates:check': {
    args: [];
    result: AppUpdateState;
  };
  'updates:download': {
    args: [];
    result: AppUpdateState;
  };
  'updates:get-status': {
    args: [];
    result: AppUpdateState;
  };
  'updates:install': {
    args: [];
    result: AppUpdateState;
  };
  'updates:simulate-available': {
    args: [];
    result: AppUpdateState;
  };
  'release-notes:get': {
    args: [input: { version: string; source: 'local' | 'remote'; language?: UiLanguage }];
    result: UserFacingReleaseNote | null;
  };
  'url:open': {
    args: [url: string];
    result: void;
  };
  'weread:get-state': {
    args: [];
    result: WeReadState;
  };
  'weread:read-api-key': {
    args: [];
    result: string;
  };
  'weread:save-settings': {
    args: [input: WeReadSaveSettingsInput];
    result: WeReadState;
  };
  'weread:test': {
    args: [apiKey?: string];
    result: ProviderTestResult;
  };
  'weread:sync': {
    args: [];
    result: WeReadSyncResult;
  };
  'weread:sync-book': {
    args: [bookId: string];
    result: WeReadBookDetail | null;
  };
  'weread:get-book': {
    args: [bookId: string];
    result: WeReadBookDetail | null;
  };
  'weread:open': {
    args: [target: WeReadOpenTarget];
    result: void;
  };
  'weread:get-reading-stats': {
    args: [];
    result: WeReadReadingStatsState;
  };
  'weread:query-reading-stats': {
    args: [input: WeReadReadingStatsQueryInput];
    result: WeReadReadingStatsState;
  };
  'user:save': {
    args: [user: Partial<UserProfile>];
    result: DesktopStore;
  };
};

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap;

export type DesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['args'];

export type DesktopIpcInvokeResult<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['result'];
