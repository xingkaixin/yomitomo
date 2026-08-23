import type {
  Annotation,
  AnnotationRetentionDecision as SharedAnnotationRetentionDecision,
  ArticleRecord,
  ArticleSourceType,
  ArticleSummaryRecord,
  ArticleUpsertPatch,
  AssistantExecutionMode,
  AssistantExecutionStatus as SharedAssistantExecutionStatus,
  AssistantExecutionTaskType as SharedAssistantExecutionTaskType,
  AssistantRuntimeResultStatus as SharedAssistantRuntimeResultStatus,
  AssistantRuntimeTaskType as SharedAssistantRuntimeTaskType,
  Collection,
  CollectionStorePatch,
  Comment,
  ContentRef,
  DesktopStore,
  ReaderChatState,
  TextSourceFormat,
  WeReadBook,
  WeReadSettings,
} from '@yomitomo/shared';
import type { DesktopIpcSchemaArgs } from './desktop-ipc-schema-fragments';

export type { ArticleImportResult } from './article-import-boundary';

export type AppInfo = {
  desktopVersion: string;
};

export type UserStorePatch = Pick<DesktopStore, 'user'>;

export type ProviderStorePatch = Pick<DesktopStore, 'agents' | 'providers' | 'settings'>;

export type AgentStorePatch = Pick<DesktopStore, 'agents'>;

export type SettingsStorePatch = UserStorePatch | ProviderStorePatch | AgentStorePatch;

export type AppLockStatus = {
  configured: boolean;
  enabled: boolean;
  locked: boolean;
  shortcut?: string;
};

export type AppLockSetPinInput = DesktopIpcSchemaArgs<'appLock:setPin'>[0];

export type AppLockVerifyPinInput = DesktopIpcSchemaArgs<'appLock:verifyPin'>[0];

export type AppLockVerifyPinResult =
  | { ok: true; retryAfterMs: 0; status: 'verified' }
  | { ok: false; retryAfterMs: number; status: 'blocked' | 'invalid' };

export type AppLockUnlockInput = DesktopIpcSchemaArgs<'appLock:unlock'>[0];

export type AppLockSetEnabledInput = DesktopIpcSchemaArgs<'appLock:setEnabled'>[0];

export type AppLockSetLockedInput = DesktopIpcSchemaArgs<'appLock:setLocked'>[0];

export type AppLockSetShortcutInput = DesktopIpcSchemaArgs<'appLock:setShortcut'>[0];

export type ArticleImportUrlInput = DesktopIpcSchemaArgs<'article:import-url'>[0];

export type ArticleAnnotationDeleteInput = {
  articleId: string;
  annotationId: string;
};

export type ArticleAnnotationUpsertInput = {
  articleId: string;
  annotation: Annotation;
  updatedAt?: string;
};

export type ArticleAnnotationDistillationSaveInput = {
  articleId: string;
  annotationId: string;
  distillation: Annotation['distillation'];
  expectedDistillationUpdatedAt: string | null;
  updatedAt?: string;
};

export type ArticleAgentAnnotationMergeInput = {
  articleId: string;
  annotation: Annotation;
};

export type ArticleAgentAnnotationMergeResult = {
  activeId: string;
  patch: ArticleUpsertPatch;
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

export type ArticleLibrarySource = ArticleSourceType;

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

type LibraryCatalogItemBase = {
  kind: 'item';
  sortTime: string;
  pinned: boolean;
};

export type LibraryCatalogItem =
  | (LibraryCatalogItemBase & {
      source: 'article';
      article: ArticleSummaryRecord;
    })
  | (LibraryCatalogItemBase & {
      source: 'weread';
      weread: WeReadBook;
    });

export function libraryCatalogItemRef(item: LibraryCatalogItem): ContentRef {
  return item.source === 'article'
    ? { kind: 'article', id: item.article.id }
    : { kind: 'weread', id: item.weread.bookId };
}

export function libraryCatalogItemType(item: LibraryCatalogItem): LibraryCatalogItemType {
  return item.source === 'article' ? item.article.sourceType : 'weread';
}

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

export type DistillationLibraryListInput = DesktopIpcSchemaArgs<'distillation-library:list'>[0];

export type DistillationLibraryItem = {
  annotationId: string;
  articleId: string;
  articleTitle: string;
  articleByline?: string;
  sourceType: ArticleLibrarySource;
  anchorText: string;
  content: string;
  publishedAt?: string;
  updatedAt: string;
};

export type DistillationLibraryListResult = {
  items: DistillationLibraryItem[];
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

export type DataManagementPathKind = DesktopIpcSchemaArgs<'data:open-path'>[0];

export type DataManagementPaths = {
  dataDir: string;
  logFile: string;
  databaseFile: string;
};

export type AssistantRuntimeTaskType = SharedAssistantRuntimeTaskType;

export type AssistantExecutionTaskType = SharedAssistantExecutionTaskType;

export type AssistantRuntimeResultStatus = SharedAssistantRuntimeResultStatus;

export type AnnotationRetentionDecision = SharedAnnotationRetentionDecision;

export type AgentRuntimeTraceListInput = {
  taskType?: AssistantRuntimeTaskType | 'all';
  agentId?: string;
  articleId?: string;
  failureOnly?: boolean;
  limit?: number;
};

export type AgentRuntimeTraceDecision = {
  annotationId: string;
  runtimeStatus?: AssistantRuntimeResultStatus;
  retention: AnnotationRetentionDecision;
  actionType?: string;
  failureReason?: string;
};

export type AgentRuntimeTraceEntry = {
  id: string;
  at: string;
  taskType: AssistantRuntimeTaskType;
  agentId: string;
  articleId: string;
  runtimeStatus: AssistantRuntimeResultStatus;
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

export type AssistantExecutionStatus = SharedAssistantExecutionStatus;

export type AssistantExecutionQueryInput = {
  from: string;
  to: string;
  agentId?: string;
  providerId?: string;
  modelName?: string;
  taskType?: AssistantExecutionTaskType;
  status?: AssistantExecutionStatus | 'all';
  requestedMode?: AssistantExecutionMode;
  effectiveMode?: AssistantExecutionMode;
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
  taskType: AssistantExecutionTaskType | 'unknown';
  requestedMode: AssistantExecutionMode | 'unknown';
  effectiveMode: AssistantExecutionMode | 'unknown';
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

export type EbookImportFileInput = DesktopIpcSchemaArgs<'ebook:import-file'>[0];

export type PdfImportFileInput = DesktopIpcSchemaArgs<'pdf:import-file'>[0];

export type TextImportPrepareInput = DesktopIpcSchemaArgs<'text:import-prepare'>[0];

export type TextImportFileInput = Extract<
  TextImportPrepareInput,
  { kind: 'files' }
>['files'][number];

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

export type TextImportCommitInput = DesktopIpcSchemaArgs<'text:import-commit'>[0];

export type TextImportCommitItem = TextImportCommitInput['items'][number];

export type TextImportCommitResult = {
  articles: ArticleRecord[];
  patches: ArticleUpsertPatch[];
};

export type PerformanceTimingInput = {
  event: string;
  data?: Record<string, unknown>;
};

export type ProviderTestResult = {
  ok: boolean;
  message: string;
};

export type WeReadSaveSettingsInput = DesktopIpcSchemaArgs<'weread:save-settings'>[0];

export type WeReadOpenTarget = DesktopIpcSchemaArgs<'weread:open'>[0];

export type WeReadState = {
  settings: WeReadSettings;
  books: WeReadBook[];
};

export type WeReadReadingStatsQueryInput = DesktopIpcSchemaArgs<'weread:query-reading-stats'>[0];

export type CreateCollectionInput = DesktopIpcSchemaArgs<'library-collection:create'>[0];

export type CreateCollectionResult = {
  collection: Collection;
  patch: CollectionStorePatch;
};

export type RenameCollectionInput = DesktopIpcSchemaArgs<'library-collection:rename'>[0];

export type AddCollectionMembersInput = DesktopIpcSchemaArgs<'library-collection:add-members'>[0];

export type RemoveCollectionMemberInput =
  DesktopIpcSchemaArgs<'library-collection:remove-member'>[0];

export type SetLibraryPinInput = DesktopIpcSchemaArgs<'library-pin:set'>[0];
