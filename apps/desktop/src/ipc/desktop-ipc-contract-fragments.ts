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

export type ArticleIpcInvokeMap = {
  'article:delete': {
    args: [id: string];
    result: ArticleDeletePatch;
    validation: { exempt: 'handler-owned' };
  };
  'article:delete-annotation': {
    args: [input: ArticleAnnotationDeleteInput];
    result: ArticleUpsertPatch | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:delete-comment': {
    args: [input: ArticleCommentDeleteInput];
    result: ArticleUpsertPatch | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:merge-agent-annotation': {
    args: [input: ArticleAgentAnnotationMergeInput];
    result: ArticleAgentAnnotationMergeResult | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:save-annotation': {
    args: [input: ArticleAnnotationUpsertInput];
    result: ArticleUpsertPatch | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:save-annotation-distillation': {
    args: [input: ArticleAnnotationDistillationSaveInput];
    result: ArticleUpsertPatch | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:save-comment': {
    args: [input: ArticleCommentUpsertInput];
    result: ArticleUpsertPatch | null;
    validation: { exempt: 'domain-payload' };
  };
  'article:get': {
    args: [id: string];
    result: ArticleRecord | null;
    validation: { exempt: 'handler-owned' };
  };
  'article:get-cover': {
    args: [id: string];
    result: string;
    validation: { exempt: 'handler-owned' };
  };
  'article:get-site-icon': {
    args: [id: string];
    result: string;
    validation: { exempt: 'handler-owned' };
  };
  'article:import-url': {
    args: DesktopIpcSchemaArgs<'article:import-url'>;
    result: ArticleImportResult;
    validation: 'schema';
  };
  'article:import-url-cancel': {
    args: DesktopIpcSchemaArgs<'article:import-url-cancel'>;
    result: boolean;
    validation: 'schema';
  };
  'article:list-library': {
    args: [input: ArticleLibraryListInput];
    result: ArticleLibraryListResult;
    validation: { exempt: 'domain-payload' };
  };
  'article:stats-summaries': {
    args: [];
    result: ArticleSummaryRecord[];
    validation: { exempt: 'no-args' };
  };
  'article:reading-progress': {
    args: [input: { articleId: string; progress: ArticleReadingProgress }];
    result: ArticleReadingProgressPatch;
    validation: { exempt: 'domain-payload' };
  };
  'article:reader-chat-state': {
    args: [input: ArticleReaderChatStateSaveInput];
    result: ArticleReaderChatStatePatch;
    validation: { exempt: 'domain-payload' };
  };
  'article-translation:get-current': {
    args: DesktopIpcSchemaArgs<'article-translation:get-current'>;
    result: ArticleTranslation | null;
    validation: 'schema';
  };
  'article-translation:translate': {
    args: DesktopIpcSchemaArgs<'article-translation:translate'>;
    result: ArticleTranslation;
    validation: 'schema';
  };
  'article-translation:delete-current': {
    args: DesktopIpcSchemaArgs<'article-translation:delete-current'>;
    result: ArticleTranslation | null;
    validation: 'schema';
  };
  'ebook:import-file': {
    args: DesktopIpcSchemaArgs<'ebook:import-file'>;
    result: ArticleImportResult;
    validation: 'schema';
  };
  'ebook:read-file': {
    args: DesktopIpcSchemaArgs<'ebook:read-file'>;
    result: ArrayBuffer;
    validation: 'schema';
  };
  'pdf:import-file': {
    args: DesktopIpcSchemaArgs<'pdf:import-file'>;
    result: ArticleImportResult;
    validation: 'schema';
  };
  'pdf:read-file': {
    args: DesktopIpcSchemaArgs<'pdf:read-file'>;
    result: ArrayBuffer;
    validation: 'schema';
  };
  'pdf:get-thumbnail': {
    args: DesktopIpcSchemaArgs<'pdf:get-thumbnail'>;
    result: string;
    validation: 'schema';
  };
  'text:import-prepare': {
    args: DesktopIpcSchemaArgs<'text:import-prepare'>;
    result: TextImportPrepareResult;
    validation: 'schema';
  };
  'text:import-commit': {
    args: DesktopIpcSchemaArgs<'text:import-commit'>;
    result: TextImportCommitResult;
    validation: 'schema';
  };
};

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

export type LibraryCollectionIpcInvokeMap = {
  'distillation-library:list': {
    args: DesktopIpcSchemaArgs<'distillation-library:list'>;
    result: DistillationLibraryListResult;
    validation: 'schema';
  };
  'library-catalog:list': {
    args: [input: LibraryCatalogListInput];
    result: LibraryCatalogListResult;
    validation: { exempt: 'domain-payload' };
  };
  'library-collection:list': {
    args: [];
    result: CollectionWithMembers[];
    validation: { exempt: 'no-args' };
  };
  'library-collection:create': {
    args: DesktopIpcSchemaArgs<'library-collection:create'>;
    result: CreateCollectionResult;
    validation: 'schema';
  };
  'library-collection:rename': {
    args: DesktopIpcSchemaArgs<'library-collection:rename'>;
    result: CollectionStorePatch;
    validation: 'schema';
  };
  'library-collection:delete': {
    args: DesktopIpcSchemaArgs<'library-collection:delete'>;
    result: CollectionStorePatch;
    validation: 'schema';
  };
  'library-collection:add-members': {
    args: DesktopIpcSchemaArgs<'library-collection:add-members'>;
    result: CollectionStorePatch;
    validation: 'schema';
  };
  'library-collection:remove-member': {
    args: DesktopIpcSchemaArgs<'library-collection:remove-member'>;
    result: CollectionStorePatch;
    validation: 'schema';
  };
  'library-pin:list': {
    args: [];
    result: LibraryPin[];
    validation: { exempt: 'no-args' };
  };
  'library-pin:set': {
    args: DesktopIpcSchemaArgs<'library-pin:set'>;
    result: LibraryPinPatch;
    validation: 'schema';
  };
};

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

export type WeReadIpcInvokeMap = {
  'weread:get-settings': {
    args: [];
    result: WeReadSettings;
    validation: { exempt: 'no-args' };
  };
  'weread:get-state': {
    args: [];
    result: WeReadState;
    validation: { exempt: 'no-args' };
  };
  'weread:read-api-key': {
    args: [];
    result: string;
    validation: { exempt: 'no-args' };
  };
  'weread:save-settings': {
    args: DesktopIpcSchemaArgs<'weread:save-settings'>;
    result: WeReadState;
    validation: 'schema';
  };
  'weread:test': {
    args: DesktopIpcSchemaArgs<'weread:test'>;
    result: ProviderTestResult;
    validation: 'schema';
  };
  'weread:sync': {
    args: [];
    result: WeReadSyncResult;
    validation: { exempt: 'no-args' };
  };
  'weread:sync-book': {
    args: DesktopIpcSchemaArgs<'weread:sync-book'>;
    result: WeReadBookDetail | null;
    validation: 'schema';
  };
  'weread:get-book': {
    args: DesktopIpcSchemaArgs<'weread:get-book'>;
    result: WeReadBookDetail | null;
    validation: 'schema';
  };
  'weread:open': {
    args: DesktopIpcSchemaArgs<'weread:open'>;
    result: void;
    validation: 'schema';
  };
  'weread:get-reading-stats': {
    args: [];
    result: WeReadReadingStatsState;
    validation: { exempt: 'no-args' };
  };
  'weread:query-reading-stats': {
    args: DesktopIpcSchemaArgs<'weread:query-reading-stats'>;
    result: WeReadReadingStatsState;
    validation: 'schema';
  };
};
