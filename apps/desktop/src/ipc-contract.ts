import type {
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  Annotation,
  AnnotationRetentionDecision as SharedAnnotationRetentionDecision,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  ArticleRecord,
  ArticleSourceType,
  ArticleStorePatch,
  ArticleSummaryRecord,
  ArticleTranslation,
  ArticleUpsertPatch,
  AssistantExecutionMode,
  AssistantExecutionStatus as SharedAssistantExecutionStatus,
  AssistantExecutionTaskType as SharedAssistantExecutionTaskType,
  AssistantRuntimeResultStatus as SharedAssistantRuntimeResultStatus,
  AssistantRuntimeProgressEvent,
  AssistantRuntimeTaskType as SharedAssistantRuntimeTaskType,
  Collection,
  CollectionStorePatch,
  Comment,
  ContentRef,
  DesktopStore,
  LibraryPinPatch,
  ReaderChatState,
  TextSourceFormat,
  WeReadBook,
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
import type { DesktopIpcSchemaArgs } from './ipc/desktop-ipc-schema-fragments';

export {
  MAX_EBOOK_IMPORT_BYTES,
  MAX_PDF_IMPORT_BYTES,
  MAX_TEXT_IMPORT_BYTES,
} from './ipc/article-import-boundary';
export type { ArticleImportResult } from './ipc/article-import-boundary';

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

export type DesktopIpcValidationExemption = 'domain-payload' | 'handler-owned' | 'no-args';

export type DesktopIpcValidationPolicy = 'schema' | { exempt: DesktopIpcValidationExemption };

type DesktopIpcInvokeEntry = {
  args: unknown[];
  result: unknown;
  validation: DesktopIpcValidationPolicy;
};

type ValidateDesktopIpcInvokeMap<
  InvokeMap extends { [Channel in keyof InvokeMap]: DesktopIpcInvokeEntry },
> = InvokeMap;

type DesktopIpcRawInvokeMap = AgentIpcInvokeMap &
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

export type DesktopIpcInvokeMap = ValidateDesktopIpcInvokeMap<DesktopIpcRawInvokeMap>;

export type DesktopIpcInvokeChannel = keyof DesktopIpcInvokeMap;

export type DesktopIpcInvokeArgs<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['args'];

export type DesktopIpcInvokeResult<Channel extends DesktopIpcInvokeChannel> =
  DesktopIpcInvokeMap[Channel]['result'];

export const desktopIpcInvokeRoutes = {
  'agent:delete': ['agent', 'delete'],
  'agent:mention-route': ['agent', 'planMentionRoute'],
  'agent:review': ['agent', 'review'],
  'agent:save': ['agent', 'save'],
  'agent-trace:clear': ['diagnostics', 'agentTraces', 'clear'],
  'agent-trace:list': ['diagnostics', 'agentTraces', 'list'],
  'agent-trace:path': ['diagnostics', 'agentTraces', 'getPath'],
  'assistant-executions:list': ['diagnostics', 'assistantExecutions', 'list'],
  'assistant-executions:detail': ['diagnostics', 'assistantExecutions', 'getDetail'],
  'assistant-executions:summary': ['diagnostics', 'assistantExecutions', 'summarize'],
  'annotation-discussion:open': ['annotations', 'discussion', 'open'],
  'annotation-discussion:close-article': ['annotations', 'discussion', 'closeArticle'],
  'annotation-sedimentation:open': ['annotations', 'sedimentation', 'open'],
  'annotation-sedimentation:commit': ['annotations', 'sedimentation', 'commit'],
  'app:info': ['app', 'getInfo'],
  'app:pdfium-wasm-url': ['app', 'readPdfiumWasmUrl'],
  'performance:timing': ['diagnostics', 'recordPerformanceTiming'],
  'url:open': ['app', 'openUrl'],
  'appLock:getStatus': ['appLock', 'getStatus'],
  'appLock:setEnabled': ['appLock', 'setEnabled'],
  'appLock:setLocked': ['appLock', 'setLocked'],
  'appLock:setPin': ['appLock', 'setPin'],
  'appLock:setShortcut': ['appLock', 'setShortcut'],
  'appLock:verifyPin': ['appLock', 'verifyPin'],
  'appLock:unlock': ['appLock', 'unlock'],
  'article:delete': ['article', 'delete'],
  'article:delete-annotation': ['article', 'deleteAnnotation'],
  'article:delete-comment': ['article', 'deleteComment'],
  'article:merge-agent-annotation': ['article', 'mergeAgentAnnotation'],
  'article:save-annotation': ['article', 'saveAnnotation'],
  'article:save-annotation-distillation': ['article', 'saveAnnotationDistillation'],
  'article:save-comment': ['article', 'saveComment'],
  'article:get': ['article', 'get'],
  'article:get-cover': ['article', 'getCover'],
  'article:get-site-icon': ['article', 'getSiteIcon'],
  'article:import-url': ['article', 'importUrl'],
  'article:import-url-cancel': ['article', 'cancelUrlImport'],
  'article:list-library': ['article', 'listLibrary'],
  'article:stats-summaries': ['article', 'readStatsSummaries'],
  'article:reading-progress': ['article', 'saveReadingProgress'],
  'article:reader-chat-state': ['article', 'saveReaderChatState'],
  'article-translation:get-current': ['article', 'translation', 'getCurrent'],
  'article-translation:translate': ['article', 'translation', 'translate'],
  'article-translation:delete-current': ['article', 'translation', 'deleteCurrent'],
  'ebook:import-file': ['article', 'ebook', 'importFile'],
  'ebook:read-file': ['article', 'ebook', 'readFile'],
  'pdf:import-file': ['article', 'pdf', 'importFile'],
  'pdf:read-file': ['article', 'pdf', 'readFile'],
  'pdf:get-thumbnail': ['article', 'pdf', 'getThumbnail'],
  'text:import-prepare': ['article', 'text', 'prepareImport'],
  'text:import-commit': ['article', 'text', 'commitImport'],
  'data:database-backup': ['data', 'backupDatabase'],
  'data:database-restore': ['data', 'restoreDatabase'],
  'data:open-path': ['data', 'openPath'],
  'data:paths': ['data', 'getPaths'],
  'log:clear': ['diagnostics', 'log', 'clear'],
  'log:path': ['diagnostics', 'log', 'getPath'],
  'log:read': ['diagnostics', 'log', 'read'],
  'distillation-library:list': ['library', 'distillations', 'list'],
  'library-catalog:list': ['library', 'catalog', 'list'],
  'library-collection:list': ['library', 'collections', 'list'],
  'library-collection:create': ['library', 'collections', 'create'],
  'library-collection:rename': ['library', 'collections', 'rename'],
  'library-collection:delete': ['library', 'collections', 'delete'],
  'library-collection:add-members': ['library', 'collections', 'addMembers'],
  'library-collection:remove-member': ['library', 'collections', 'removeMember'],
  'library-pin:list': ['library', 'pins', 'list'],
  'library-pin:set': ['library', 'pins', 'set'],
  'provider:delete': ['provider', 'delete'],
  'provider:list-models': ['provider', 'listModels'],
  'provider:read-api-key': ['provider', 'readApiKey'],
  'provider:save': ['provider', 'save'],
  'provider:test': ['provider', 'test'],
  'settings:save': ['store', 'saveSettings'],
  'user:save': ['store', 'saveUser'],
  'store:get': ['store', 'getStateResult'],
  'updates:check': ['updates', 'check'],
  'updates:download': ['updates', 'download'],
  'updates:get-status': ['updates', 'getStatus'],
  'updates:install': ['updates', 'install'],
  'updates:simulate-available': ['updates', 'simulateAvailable'],
  'release-notes:get': ['updates', 'getReleaseNote'],
  'weread:get-settings': ['weRead', 'getSettings'],
  'weread:get-state': ['weRead', 'getState'],
  'weread:read-api-key': ['weRead', 'readApiKey'],
  'weread:save-settings': ['weRead', 'saveSettings'],
  'weread:test': ['weRead', 'test'],
  'weread:sync': ['weRead', 'sync'],
  'weread:sync-book': ['weRead', 'syncBook'],
  'weread:get-book': ['weRead', 'getBook'],
  'weread:open': ['weRead', 'open'],
  'weread:get-reading-stats': ['weRead', 'getReadingStats'],
  'weread:query-reading-stats': ['weRead', 'queryReadingStats'],
} as const satisfies Record<DesktopIpcInvokeChannel, readonly [domain: string, ...path: string[]]>;

type DesktopIpcRouteApi<Route extends readonly string[], Operation> = Route extends readonly [
  infer Segment extends string,
  ...infer Rest extends string[],
]
  ? { [Key in Segment]: DesktopIpcRouteApi<Rest, Operation> }
  : Operation;

type UnionToIntersection<Union> = (Union extends unknown ? (value: Union) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

export type DesktopIpcInvokeApi = UnionToIntersection<
  {
    [Channel in DesktopIpcInvokeChannel]: DesktopIpcRouteApi<
      (typeof desktopIpcInvokeRoutes)[Channel],
      (...args: DesktopIpcInvokeArgs<Channel>) => Promise<DesktopIpcInvokeResult<Channel>>
    >;
  }[DesktopIpcInvokeChannel]
>;

export type DesktopIpcDeclaredSchemaChannel = {
  [Channel in DesktopIpcInvokeChannel]: DesktopIpcInvokeMap[Channel]['validation'] extends 'schema'
    ? Channel
    : never;
}[DesktopIpcInvokeChannel];

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

export type DesktopIpcToMainEventMap = DesktopIpcStreamRequestMap & {
  'app:renderer-ready': undefined;
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
