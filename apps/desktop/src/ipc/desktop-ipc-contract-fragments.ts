import type {
  Agent,
  AgentMentionInstructionPayload,
  AgentMentionRoutePlan,
  AgentReviewPayload,
  AppSettings,
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
  ArticleSummaryRecord,
  ArticleTranslation,
  ArticleUpsertPatch,
  CollectionStorePatch,
  CollectionWithMembers,
  Comment,
  DesktopStore,
  LibraryPin,
  LibraryPinPatch,
  LlmProvider,
  ProviderModel,
  UiLanguage,
  UserFacingReleaseNote,
  UserProfile,
  WeReadBookDetail,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadSyncResult,
} from '@yomitomo/shared';
import type { DesktopStoreGetResult } from '../app-store-errors';
import type { AppUpdateState, AppUpdateTrigger } from '../app-update-types';
import {
  annotationAndMain,
  desktopIpcInvoke,
  mainOnly,
  type DesktopIpcInvokeDescriptor,
} from './desktop-ipc-descriptor';
import type { DesktopIpcSchemaArgs } from './desktop-ipc-schema-fragments';
import type {
  AgentRuntimeTraceEntry,
  AgentRuntimeTraceListInput,
  AgentStorePatch,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowOpenResult,
  AnnotationDiscussionWindowsCloseArticleInput,
  AnnotationDiscussionWindowsCloseArticleResult,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationCommitResult,
  AnnotationSedimentationWindowOpenInput,
  AnnotationSedimentationWindowOpenResult,
  AppInfo,
  AppLockStatus,
  AppLockVerifyPinResult,
  ArticleAnnotationDeleteInput,
  ArticleAnnotationDistillationSaveInput,
  ArticleAnnotationUpsertInput,
  ArticleAgentAnnotationMergeInput,
  ArticleAgentAnnotationMergeResult,
  ArticleCommentDeleteInput,
  ArticleCommentUpsertInput,
  ArticleImportResult,
  ArticleLibraryListInput,
  ArticleLibraryListResult,
  ArticleReaderChatStateSaveInput,
  AssistantExecutionQueryInput,
  AssistantExecutionRunDetail,
  AssistantExecutionRunListItem,
  AssistantExecutionSummary,
  CreateCollectionResult,
  DataManagementPaths,
  DatabaseBackupResult,
  DatabaseRestoreResult,
  DistillationLibraryListResult,
  TextImportPrepareResult,
  TextImportCommitResult,
  PerformanceTimingInput,
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  ProviderTestResult,
  ProviderStorePatch,
  UserStorePatch,
  WeReadState,
} from '../ipc-contract';

export type AgentIpcInvokeMap = {
  'agent:delete': {
    args: [id: string];
    result: AgentStorePatch;
    validation: { exempt: 'handler-owned' };
  };
  'agent:mention-route': {
    args: [payload: AgentMentionInstructionPayload];
    result: AgentMentionRoutePlan;
    validation: { exempt: 'domain-payload' };
  };
  'agent:review': {
    args: [payload: AgentReviewPayload];
    result: Comment[];
    validation: { exempt: 'domain-payload' };
  };
  'agent:save': {
    args: [agent: Partial<Agent>];
    result: AgentStorePatch;
    validation: { exempt: 'domain-payload' };
  };
  'agent-trace:clear': {
    args: [];
    result: void;
    validation: { exempt: 'no-args' };
  };
  'agent-trace:list': {
    args: [input?: AgentRuntimeTraceListInput];
    result: AgentRuntimeTraceEntry[];
    validation: { exempt: 'domain-payload' };
  };
  'agent-trace:path': {
    args: [];
    result: string;
    validation: { exempt: 'no-args' };
  };
  'assistant-executions:list': {
    args: [input: AssistantExecutionQueryInput];
    result: AssistantExecutionRunListItem[];
    validation: { exempt: 'domain-payload' };
  };
  'assistant-executions:detail': {
    args: [id: string];
    result: AssistantExecutionRunDetail | null;
    validation: { exempt: 'handler-owned' };
  };
  'assistant-executions:summary': {
    args: [input: AssistantExecutionQueryInput];
    result: AssistantExecutionSummary;
    validation: { exempt: 'domain-payload' };
  };
};

export type AnnotationWindowIpcInvokeMap = {
  'annotation-discussion:open': {
    args: [input: AnnotationDiscussionWindowOpenInput];
    result: AnnotationDiscussionWindowOpenResult;
    validation: { exempt: 'domain-payload' };
  };
  'annotation-discussion:close-article': {
    args: [input: AnnotationDiscussionWindowsCloseArticleInput];
    result: AnnotationDiscussionWindowsCloseArticleResult;
    validation: { exempt: 'domain-payload' };
  };
  'annotation-sedimentation:open': {
    args: [input: AnnotationSedimentationWindowOpenInput];
    result: AnnotationSedimentationWindowOpenResult;
    validation: { exempt: 'domain-payload' };
  };
  'annotation-sedimentation:commit': {
    args: [input: AnnotationSedimentationCommitInput];
    result: AnnotationSedimentationCommitResult;
    validation: { exempt: 'domain-payload' };
  };
};

export const appIpcInvokeDescriptors = {
  'app:info': desktopIpcInvoke<[], AppInfo>()({
    route: ['app', 'getInfo'],
    roles: annotationAndMain,
    validation: { exempt: 'no-args' },
    appLockBypass: true,
  }),
  'app:pdfium-wasm-url': desktopIpcInvoke<[], string>()({
    route: ['app', 'readPdfiumWasmUrl'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'performance:timing': desktopIpcInvoke<[input: PerformanceTimingInput], void>()({
    route: ['diagnostics', 'recordPerformanceTiming'],
    roles: annotationAndMain,
    validation: { exempt: 'domain-payload' },
    appLockBypass: true,
  }),
  'url:open': desktopIpcInvoke<[url: string], void>()({
    route: ['app', 'openUrl'],
    roles: annotationAndMain,
    validation: { exempt: 'handler-owned' },
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const appLockIpcInvokeDescriptors = {
  'appLock:getStatus': desktopIpcInvoke<[], AppLockStatus>()({
    route: ['appLock', 'getStatus'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    appLockBypass: true,
  }),
  'appLock:setEnabled': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'appLock:setEnabled'>,
    DesktopStore
  >()({
    route: ['appLock', 'setEnabled'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'appLock:setLocked': desktopIpcInvoke<DesktopIpcSchemaArgs<'appLock:setLocked'>, DesktopStore>()({
    route: ['appLock', 'setLocked'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'appLock:setPin': desktopIpcInvoke<DesktopIpcSchemaArgs<'appLock:setPin'>, AppLockStatus>()({
    route: ['appLock', 'setPin'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'appLock:setShortcut': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'appLock:setShortcut'>,
    DesktopStore
  >()({
    route: ['appLock', 'setShortcut'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'appLock:verifyPin': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'appLock:verifyPin'>,
    AppLockVerifyPinResult
  >()({
    route: ['appLock', 'verifyPin'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'appLock:unlock': desktopIpcInvoke<DesktopIpcSchemaArgs<'appLock:unlock'>, DesktopStore>()({
    route: ['appLock', 'unlock'],
    roles: mainOnly,
    validation: 'schema',
    appLockBypass: true,
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const articleIpcInvokeDescriptors = {
  'article:delete': desktopIpcInvoke<[id: string], ArticleDeletePatch>()({
    route: ['article', 'delete'],
    roles: mainOnly,
    validation: { exempt: 'handler-owned' },
  }),
  'article:delete-annotation': desktopIpcInvoke<
    [input: ArticleAnnotationDeleteInput],
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'deleteAnnotation'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article:delete-comment': desktopIpcInvoke<
    [input: ArticleCommentDeleteInput],
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'deleteComment'],
    roles: annotationAndMain,
    validation: { exempt: 'domain-payload' },
  }),
  'article:merge-agent-annotation': desktopIpcInvoke<
    [input: ArticleAgentAnnotationMergeInput],
    ArticleAgentAnnotationMergeResult | null
  >()({
    route: ['article', 'mergeAgentAnnotation'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article:save-annotation': desktopIpcInvoke<
    [input: ArticleAnnotationUpsertInput],
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveAnnotation'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article:save-annotation-distillation': desktopIpcInvoke<
    [input: ArticleAnnotationDistillationSaveInput],
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveAnnotationDistillation'],
    roles: annotationAndMain,
    validation: { exempt: 'domain-payload' },
  }),
  'article:save-comment': desktopIpcInvoke<
    [input: ArticleCommentUpsertInput],
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveComment'],
    roles: annotationAndMain,
    validation: { exempt: 'domain-payload' },
  }),
  'article:get': desktopIpcInvoke<[id: string], ArticleRecord | null>()({
    route: ['article', 'get'],
    roles: annotationAndMain,
    validation: { exempt: 'handler-owned' },
  }),
  'article:get-cover': desktopIpcInvoke<[id: string], string>()({
    route: ['article', 'getCover'],
    roles: mainOnly,
    validation: { exempt: 'handler-owned' },
  }),
  'article:get-site-icon': desktopIpcInvoke<[id: string], string>()({
    route: ['article', 'getSiteIcon'],
    roles: mainOnly,
    validation: { exempt: 'handler-owned' },
  }),
  'article:import-url': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:import-url'>,
    ArticleImportResult
  >()({
    route: ['article', 'importUrl'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:import-url-cancel': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:import-url-cancel'>,
    boolean
  >()({
    route: ['article', 'cancelUrlImport'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:list-library': desktopIpcInvoke<
    [input: ArticleLibraryListInput],
    ArticleLibraryListResult
  >()({
    route: ['article', 'listLibrary'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article:stats-summaries': desktopIpcInvoke<[], ArticleSummaryRecord[]>()({
    route: ['article', 'readStatsSummaries'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'article:reading-progress': desktopIpcInvoke<
    [input: { articleId: string; progress: ArticleReadingProgress }],
    ArticleReadingProgressPatch
  >()({
    route: ['article', 'saveReadingProgress'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article:reader-chat-state': desktopIpcInvoke<
    [input: ArticleReaderChatStateSaveInput],
    ArticleReaderChatStatePatch
  >()({
    route: ['article', 'saveReaderChatState'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'article-translation:get-current': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article-translation:get-current'>,
    ArticleTranslation | null
  >()({
    route: ['article', 'translation', 'getCurrent'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article-translation:translate': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article-translation:translate'>,
    ArticleTranslation
  >()({
    route: ['article', 'translation', 'translate'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article-translation:delete-current': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article-translation:delete-current'>,
    ArticleTranslation | null
  >()({
    route: ['article', 'translation', 'deleteCurrent'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'ebook:import-file': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'ebook:import-file'>,
    ArticleImportResult
  >()({
    route: ['article', 'ebook', 'importFile'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'ebook:read-file': desktopIpcInvoke<DesktopIpcSchemaArgs<'ebook:read-file'>, ArrayBuffer>()({
    route: ['article', 'ebook', 'readFile'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'pdf:import-file': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'pdf:import-file'>,
    ArticleImportResult
  >()({
    route: ['article', 'pdf', 'importFile'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'pdf:read-file': desktopIpcInvoke<DesktopIpcSchemaArgs<'pdf:read-file'>, ArrayBuffer>()({
    route: ['article', 'pdf', 'readFile'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'pdf:get-thumbnail': desktopIpcInvoke<DesktopIpcSchemaArgs<'pdf:get-thumbnail'>, string>()({
    route: ['article', 'pdf', 'getThumbnail'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'text:import-prepare': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'text:import-prepare'>,
    TextImportPrepareResult
  >()({
    route: ['article', 'text', 'prepareImport'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'text:import-commit': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'text:import-commit'>,
    TextImportCommitResult
  >()({
    route: ['article', 'text', 'commitImport'],
    roles: mainOnly,
    validation: 'schema',
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const dataIpcInvokeDescriptors = {
  'data:database-backup': desktopIpcInvoke<[], DatabaseBackupResult>()({
    route: ['data', 'backupDatabase'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'data:database-restore': desktopIpcInvoke<[], DatabaseRestoreResult>()({
    route: ['data', 'restoreDatabase'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
    databaseLifecycle: true,
  }),
  'data:open-path': desktopIpcInvoke<DesktopIpcSchemaArgs<'data:open-path'>, void>()({
    route: ['data', 'openPath'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'data:paths': desktopIpcInvoke<[], DataManagementPaths>()({
    route: ['data', 'getPaths'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'log:clear': desktopIpcInvoke<[], void>()({
    route: ['diagnostics', 'log', 'clear'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'log:path': desktopIpcInvoke<[], string>()({
    route: ['diagnostics', 'log', 'getPath'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'log:read': desktopIpcInvoke<[], string>()({
    route: ['diagnostics', 'log', 'read'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const libraryCollectionIpcInvokeDescriptors = {
  'distillation-library:list': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'distillation-library:list'>,
    DistillationLibraryListResult
  >()({
    route: ['library', 'distillations', 'list'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-catalog:list': desktopIpcInvoke<
    [input: LibraryCatalogListInput],
    LibraryCatalogListResult
  >()({
    route: ['library', 'catalog', 'list'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
  'library-collection:list': desktopIpcInvoke<[], CollectionWithMembers[]>()({
    route: ['library', 'collections', 'list'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'library-collection:create': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'library-collection:create'>,
    CreateCollectionResult
  >()({
    route: ['library', 'collections', 'create'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-collection:rename': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'library-collection:rename'>,
    CollectionStorePatch
  >()({
    route: ['library', 'collections', 'rename'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-collection:delete': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'library-collection:delete'>,
    CollectionStorePatch
  >()({
    route: ['library', 'collections', 'delete'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-collection:add-members': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'library-collection:add-members'>,
    CollectionStorePatch
  >()({
    route: ['library', 'collections', 'addMembers'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-collection:remove-member': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'library-collection:remove-member'>,
    CollectionStorePatch
  >()({
    route: ['library', 'collections', 'removeMember'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'library-pin:list': desktopIpcInvoke<[], LibraryPin[]>()({
    route: ['library', 'pins', 'list'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'library-pin:set': desktopIpcInvoke<DesktopIpcSchemaArgs<'library-pin:set'>, LibraryPinPatch>()({
    route: ['library', 'pins', 'set'],
    roles: mainOnly,
    validation: 'schema',
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export type ProviderIpcInvokeMap = {
  'provider:delete': {
    args: [id: string];
    result: ProviderStorePatch;
    validation: { exempt: 'handler-owned' };
  };
  'provider:list-models': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderModel[];
    validation: { exempt: 'domain-payload' };
  };
  'provider:read-api-key': {
    args: [providerId: string];
    result: string;
    validation: { exempt: 'handler-owned' };
  };
  'provider:save': {
    args: [provider: Partial<LlmProvider> & { removeApiKey?: boolean }];
    result: ProviderStorePatch;
    validation: { exempt: 'domain-payload' };
  };
  'provider:test': {
    args: [provider: Partial<LlmProvider>];
    result: ProviderTestResult;
    validation: { exempt: 'domain-payload' };
  };
  'settings:save': {
    args: [settings: AppSettings];
    result: DesktopStore;
    validation: { exempt: 'domain-payload' };
  };
  'user:save': {
    args: [user: Partial<UserProfile>];
    result: UserStorePatch;
    validation: { exempt: 'domain-payload' };
  };
};

export const storeIpcInvokeDescriptors = {
  'store:get': desktopIpcInvoke<[], DesktopStoreGetResult>()({
    route: ['store', 'getStateResult'],
    roles: annotationAndMain,
    validation: { exempt: 'no-args' },
    appLockBypass: true,
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const updateIpcInvokeDescriptors = {
  'updates:check': desktopIpcInvoke<[], AppUpdateState>()({
    route: ['updates', 'check'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'updates:download': desktopIpcInvoke<[], AppUpdateState>()({
    route: ['updates', 'download'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'updates:get-status': desktopIpcInvoke<[], AppUpdateState>()({
    route: ['updates', 'getStatus'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'updates:install': desktopIpcInvoke<[], AppUpdateState>()({
    route: ['updates', 'install'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'updates:simulate-available': desktopIpcInvoke<[trigger?: AppUpdateTrigger], AppUpdateState>()({
    route: ['updates', 'simulateAvailable'],
    roles: mainOnly,
    validation: { exempt: 'handler-owned' },
  }),
  'release-notes:get': desktopIpcInvoke<
    [input: { version: string; source: 'local' | 'remote'; language?: UiLanguage }],
    UserFacingReleaseNote | null
  >()({
    route: ['updates', 'getReleaseNote'],
    roles: mainOnly,
    validation: { exempt: 'domain-payload' },
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;

export const weReadIpcInvokeDescriptors = {
  'weread:get-settings': desktopIpcInvoke<[], WeReadSettings>()({
    route: ['weRead', 'getSettings'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'weread:get-state': desktopIpcInvoke<[], WeReadState>()({
    route: ['weRead', 'getState'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'weread:read-api-key': desktopIpcInvoke<[], string>()({
    route: ['weRead', 'readApiKey'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'weread:save-settings': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'weread:save-settings'>,
    WeReadState
  >()({
    route: ['weRead', 'saveSettings'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'weread:test': desktopIpcInvoke<DesktopIpcSchemaArgs<'weread:test'>, ProviderTestResult>()({
    route: ['weRead', 'test'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'weread:sync': desktopIpcInvoke<[], WeReadSyncResult>()({
    route: ['weRead', 'sync'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'weread:sync-book': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'weread:sync-book'>,
    WeReadBookDetail | null
  >()({
    route: ['weRead', 'syncBook'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'weread:get-book': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'weread:get-book'>,
    WeReadBookDetail | null
  >()({
    route: ['weRead', 'getBook'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'weread:open': desktopIpcInvoke<DesktopIpcSchemaArgs<'weread:open'>, void>()({
    route: ['weRead', 'open'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'weread:get-reading-stats': desktopIpcInvoke<[], WeReadReadingStatsState>()({
    route: ['weRead', 'getReadingStats'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'weread:query-reading-stats': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'weread:query-reading-stats'>,
    WeReadReadingStatsState
  >()({
    route: ['weRead', 'queryReadingStats'],
    roles: mainOnly,
    validation: 'schema',
  }),
} satisfies Record<string, DesktopIpcInvokeDescriptor>;
