import type {
  AgentMentionRoutePlan,
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
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
  ProviderModel,
  UserFacingReleaseNote,
  WeReadBookDetail,
  WeReadReadingStatsState,
  WeReadSettings,
  WeReadSyncResult,
} from '@yomitomo/shared';
import type { DesktopStoreGetResult } from '../app-store-errors';
import type { AppUpdateState } from '../app-update-types';
import { annotationAndMain, desktopIpcInvoke, mainOnly } from './desktop-ipc-descriptor';
import type { DesktopIpcSchemaArgs } from './desktop-ipc-schema-fragments';
import type {
  AgentRuntimeTraceEntry,
  AgentStorePatch,
  AnnotationDiscussionWindowOpenResult,
  AnnotationDiscussionWindowsCloseArticleResult,
  AnnotationSedimentationCommitResult,
  AnnotationSedimentationWindowOpenResult,
  AppInfo,
  AppLockStatus,
  AppLockVerifyPinResult,
  ArticleAgentAnnotationMergeResult,
  ArticleImportResult,
  ArticleLibraryListResult,
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
  LibraryCatalogListResult,
  ProviderTestResult,
  ProviderStorePatch,
  UserStorePatch,
  WeReadState,
} from './desktop-ipc-domain';

export const agentIpcInvokeDescriptors = {
  'agent:delete': desktopIpcInvoke<DesktopIpcSchemaArgs<'agent:delete'>, AgentStorePatch>()({
    route: ['agent', 'delete'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'agent:mention-route': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'agent:mention-route'>,
    AgentMentionRoutePlan
  >()({
    route: ['agent', 'planMentionRoute'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'agent:review': desktopIpcInvoke<DesktopIpcSchemaArgs<'agent:review'>, Comment[]>()({
    route: ['agent', 'review'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'agent:save': desktopIpcInvoke<DesktopIpcSchemaArgs<'agent:save'>, AgentStorePatch>()({
    route: ['agent', 'save'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'agent-trace:clear': desktopIpcInvoke<[], void>()({
    route: ['diagnostics', 'agentTraces', 'clear'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'agent-trace:list': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'agent-trace:list'>,
    AgentRuntimeTraceEntry[]
  >()({
    route: ['diagnostics', 'agentTraces', 'list'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'agent-trace:path': desktopIpcInvoke<[], string>()({
    route: ['diagnostics', 'agentTraces', 'getPath'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'assistant-executions:list': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'assistant-executions:list'>,
    AssistantExecutionRunListItem[]
  >()({
    route: ['diagnostics', 'assistantExecutions', 'list'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'assistant-executions:detail': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'assistant-executions:detail'>,
    AssistantExecutionRunDetail | null
  >()({
    route: ['diagnostics', 'assistantExecutions', 'getDetail'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'assistant-executions:summary': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'assistant-executions:summary'>,
    AssistantExecutionSummary
  >()({
    route: ['diagnostics', 'assistantExecutions', 'summarize'],
    roles: mainOnly,
    validation: 'schema',
  }),
} as const;

export const annotationWindowIpcInvokeDescriptors = {
  'annotation-discussion:open': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'annotation-discussion:open'>,
    AnnotationDiscussionWindowOpenResult
  >()({
    route: ['annotations', 'discussion', 'open'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'annotation-discussion:close-article': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'annotation-discussion:close-article'>,
    AnnotationDiscussionWindowsCloseArticleResult
  >()({
    route: ['annotations', 'discussion', 'closeArticle'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'annotation-sedimentation:open': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'annotation-sedimentation:open'>,
    AnnotationSedimentationWindowOpenResult
  >()({
    route: ['annotations', 'sedimentation', 'open'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'annotation-sedimentation:commit': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'annotation-sedimentation:commit'>,
    AnnotationSedimentationCommitResult
  >()({
    route: ['annotations', 'sedimentation', 'commit'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
} as const;

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
  'performance:timing': desktopIpcInvoke<DesktopIpcSchemaArgs<'performance:timing'>, void>()({
    route: ['diagnostics', 'recordPerformanceTiming'],
    roles: annotationAndMain,
    validation: 'schema',
    appLockBypass: true,
  }),
  'url:open': desktopIpcInvoke<DesktopIpcSchemaArgs<'url:open'>, void>()({
    route: ['app', 'openUrl'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
} as const;

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
} as const;

export const articleIpcInvokeDescriptors = {
  'article:delete': desktopIpcInvoke<DesktopIpcSchemaArgs<'article:delete'>, ArticleDeletePatch>()({
    route: ['article', 'delete'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:delete-annotation': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:delete-annotation'>,
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'deleteAnnotation'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:delete-comment': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:delete-comment'>,
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'deleteComment'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'article:merge-agent-annotation': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:merge-agent-annotation'>,
    ArticleAgentAnnotationMergeResult | null
  >()({
    route: ['article', 'mergeAgentAnnotation'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:save-annotation': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:save-annotation'>,
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveAnnotation'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:save-annotation-distillation': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:save-annotation-distillation'>,
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveAnnotationDistillation'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'article:save-comment': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:save-comment'>,
    ArticleUpsertPatch | null
  >()({
    route: ['article', 'saveComment'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'article:get': desktopIpcInvoke<DesktopIpcSchemaArgs<'article:get'>, ArticleRecord | null>()({
    route: ['article', 'get'],
    roles: annotationAndMain,
    validation: 'schema',
  }),
  'article:get-cover': desktopIpcInvoke<DesktopIpcSchemaArgs<'article:get-cover'>, string>()({
    route: ['article', 'getCover'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:get-site-icon': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:get-site-icon'>,
    string
  >()({
    route: ['article', 'getSiteIcon'],
    roles: mainOnly,
    validation: 'schema',
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
    DesktopIpcSchemaArgs<'article:list-library'>,
    ArticleLibraryListResult
  >()({
    route: ['article', 'listLibrary'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:stats-summaries': desktopIpcInvoke<[], ArticleSummaryRecord[]>()({
    route: ['article', 'readStatsSummaries'],
    roles: mainOnly,
    validation: { exempt: 'no-args' },
  }),
  'article:reading-progress': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:reading-progress'>,
    ArticleReadingProgressPatch
  >()({
    route: ['article', 'saveReadingProgress'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'article:reader-chat-state': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'article:reader-chat-state'>,
    ArticleReaderChatStatePatch
  >()({
    route: ['article', 'saveReaderChatState'],
    roles: mainOnly,
    validation: 'schema',
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
} as const;

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
    // Restore owns the lifecycle, so acquiring a lease would deadlock the drain.
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
} as const;

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
    DesktopIpcSchemaArgs<'library-catalog:list'>,
    LibraryCatalogListResult
  >()({
    route: ['library', 'catalog', 'list'],
    roles: mainOnly,
    validation: 'schema',
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
} as const;

export const providerIpcInvokeDescriptors = {
  'provider:delete': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'provider:delete'>,
    ProviderStorePatch
  >()({
    route: ['provider', 'delete'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'provider:list-models': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'provider:list-models'>,
    ProviderModel[]
  >()({
    route: ['provider', 'listModels'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'provider:read-api-key': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'provider:read-api-key'>,
    string
  >()({
    route: ['provider', 'readApiKey'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'provider:save': desktopIpcInvoke<DesktopIpcSchemaArgs<'provider:save'>, ProviderStorePatch>()({
    route: ['provider', 'save'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'provider:test': desktopIpcInvoke<DesktopIpcSchemaArgs<'provider:test'>, ProviderTestResult>()({
    route: ['provider', 'test'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'settings:save': desktopIpcInvoke<DesktopIpcSchemaArgs<'settings:save'>, DesktopStore>()({
    route: ['store', 'saveSettings'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'user:save': desktopIpcInvoke<DesktopIpcSchemaArgs<'user:save'>, UserStorePatch>()({
    route: ['store', 'saveUser'],
    roles: mainOnly,
    validation: 'schema',
  }),
} as const;

export const storeIpcInvokeDescriptors = {
  'store:get': desktopIpcInvoke<[], DesktopStoreGetResult>()({
    route: ['store', 'getStateResult'],
    roles: annotationAndMain,
    validation: { exempt: 'no-args' },
    appLockBypass: true,
  }),
} as const;

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
  'updates:simulate-available': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'updates:simulate-available'>,
    AppUpdateState
  >()({
    route: ['updates', 'simulateAvailable'],
    roles: mainOnly,
    validation: 'schema',
  }),
  'release-notes:get': desktopIpcInvoke<
    DesktopIpcSchemaArgs<'release-notes:get'>,
    UserFacingReleaseNote | null
  >()({
    route: ['updates', 'getReleaseNote'],
    roles: mainOnly,
    validation: 'schema',
  }),
} as const;

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
} as const;
