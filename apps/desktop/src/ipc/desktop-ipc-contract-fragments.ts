import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AgentMentionInstructionPayload,
  AgentMentionRoutePlan,
  AgentReviewPayload,
  AnnotationDistillationReviewMessage,
  AppSettings,
  ArticleDeletePatch,
  ArticleReaderChatStatePatch,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  ArticleRecord,
  ArticleSummaryRecord,
  ArticleTranslation,
  ArticleTranslationDeleteRequest,
  ArticleTranslationRequest,
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
import type {
  AgentRuntimeTraceEntry,
  AgentRuntimeTraceListInput,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowOpenResult,
  AnnotationDiscussionWindowsCloseArticleInput,
  AnnotationDiscussionWindowsCloseArticleResult,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationCommitResult,
  AnnotationSedimentationWindowOpenInput,
  AnnotationSedimentationWindowOpenResult,
  AppInfo,
  AppLockSetEnabledInput,
  AppLockSetLockedInput,
  AppLockSetPinInput,
  AppLockSetShortcutInput,
  AppLockStatus,
  AppLockUnlockInput,
  AppLockVerifyPinInput,
  AppLockVerifyPinResult,
  ArticleAnnotationDeleteInput,
  ArticleAnnotationDistillationSaveInput,
  ArticleAnnotationUpsertInput,
  ArticleAgentAnnotationMergeInput,
  ArticleAgentAnnotationMergeResult,
  ArticleCommentDeleteInput,
  ArticleCommentUpsertInput,
  ArticleImportResult,
  ArticleImportUrlInput,
  ArticleLibraryListInput,
  ArticleLibraryListResult,
  ArticleReaderChatStateSaveInput,
  AddCollectionMembersInput,
  AssistantExecutionQueryInput,
  AssistantExecutionRunDetail,
  AssistantExecutionRunListItem,
  AssistantExecutionSummary,
  CreateCollectionInput,
  CreateCollectionResult,
  DataManagementPathKind,
  DataManagementPaths,
  DatabaseBackupResult,
  DatabaseRestoreResult,
  DistillationLibraryListInput,
  DistillationLibraryListResult,
  EbookImportFileInput,
  PdfImportFileInput,
  TextImportPrepareInput,
  TextImportPrepareResult,
  TextImportCommitInput,
  TextImportCommitResult,
  PerformanceTimingInput,
  LibraryCatalogListInput,
  LibraryCatalogListResult,
  ProviderTestResult,
  RemoveCollectionMemberInput,
  RenameCollectionInput,
  SetLibraryPinInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
  WeReadState,
} from '../ipc-contract';

export type AgentIpcInvokeMap = {
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
    result: AssistantExecutionRunListItem[];
  };
  'assistant-executions:detail': {
    args: [id: string];
    result: AssistantExecutionRunDetail | null;
  };
  'assistant-executions:summary': {
    args: [input: AssistantExecutionQueryInput];
    result: AssistantExecutionSummary;
  };
};

export type AnnotationWindowIpcInvokeMap = {
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
};

export type AppIpcInvokeMap = {
  'app:info': {
    args: [];
    result: AppInfo;
  };
  'performance:timing': {
    args: [input: PerformanceTimingInput];
    result: void;
  };
  'url:open': {
    args: [url: string];
    result: void;
  };
};

export type AppLockIpcInvokeMap = {
  'appLock:getStatus': {
    args: [];
    result: AppLockStatus;
  };
  'appLock:setEnabled': {
    args: [input: AppLockSetEnabledInput];
    result: DesktopStore;
  };
  'appLock:setLocked': {
    args: [input: AppLockSetLockedInput];
    result: DesktopStore;
  };
  'appLock:setPin': {
    args: [input: AppLockSetPinInput];
    result: AppLockStatus;
  };
  'appLock:setShortcut': {
    args: [input: AppLockSetShortcutInput];
    result: DesktopStore;
  };
  'appLock:verifyPin': {
    args: [input: AppLockVerifyPinInput];
    result: AppLockVerifyPinResult;
  };
  'appLock:unlock': {
    args: [input: AppLockUnlockInput];
    result: DesktopStore;
  };
};

export type ArticleIpcInvokeMap = {
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
  'article:merge-agent-annotation': {
    args: [input: ArticleAgentAnnotationMergeInput];
    result: ArticleAgentAnnotationMergeResult | null;
  };
  'article:save-annotation': {
    args: [input: ArticleAnnotationUpsertInput];
    result: ArticleUpsertPatch | null;
  };
  'article:save-annotation-distillation': {
    args: [input: ArticleAnnotationDistillationSaveInput];
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
  'article:list-library': {
    args: [input: ArticleLibraryListInput];
    result: ArticleLibraryListResult;
  };
  'article:stats-summaries': {
    args: [];
    result: ArticleSummaryRecord[];
  };
  'article:reading-progress': {
    args: [input: { articleId: string; progress: ArticleReadingProgress }];
    result: ArticleReadingProgressPatch;
  };
  'article:reader-chat-state': {
    args: [input: ArticleReaderChatStateSaveInput];
    result: ArticleReaderChatStatePatch;
  };
  'article-translation:get-current': {
    args: [input: ArticleTranslationRequest];
    result: ArticleTranslation | null;
  };
  'article-translation:translate': {
    args: [input: ArticleTranslationRequest];
    result: ArticleTranslation;
  };
  'article-translation:delete-current': {
    args: [input: ArticleTranslationDeleteRequest];
    result: ArticleTranslation | null;
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
  'text:import-prepare': {
    args: [input: TextImportPrepareInput];
    result: TextImportPrepareResult;
  };
  'text:import-commit': {
    args: [input: TextImportCommitInput];
    result: TextImportCommitResult;
  };
};

export type DataIpcInvokeMap = {
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
};

export type LibraryCollectionIpcInvokeMap = {
  'distillation-library:list': {
    args: [input: DistillationLibraryListInput];
    result: DistillationLibraryListResult;
  };
  'library-catalog:list': {
    args: [input: LibraryCatalogListInput];
    result: LibraryCatalogListResult;
  };
  'library-collection:list': {
    args: [];
    result: CollectionWithMembers[];
  };
  'library-collection:create': {
    args: [input: CreateCollectionInput];
    result: CreateCollectionResult;
  };
  'library-collection:rename': {
    args: [input: RenameCollectionInput];
    result: CollectionStorePatch;
  };
  'library-collection:delete': {
    args: [collectionId: string];
    result: CollectionStorePatch;
  };
  'library-collection:add-members': {
    args: [input: AddCollectionMembersInput];
    result: CollectionStorePatch;
  };
  'library-collection:remove-member': {
    args: [input: RemoveCollectionMemberInput];
    result: CollectionStorePatch;
  };
  'library-pin:list': {
    args: [];
    result: LibraryPin[];
  };
  'library-pin:set': {
    args: [input: SetLibraryPinInput];
    result: LibraryPinPatch;
  };
};

export type ProviderIpcInvokeMap = {
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
  'user:save': {
    args: [user: Partial<UserProfile>];
    result: DesktopStore;
  };
};

export type StoreIpcInvokeMap = {
  'store:get': {
    args: [];
    result: DesktopStoreGetResult;
  };
};

export type UpdateIpcInvokeMap = {
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
    args: [trigger?: AppUpdateTrigger];
    result: AppUpdateState;
  };
  'release-notes:get': {
    args: [input: { version: string; source: 'local' | 'remote'; language?: UiLanguage }];
    result: UserFacingReleaseNote | null;
  };
};

export type WeReadIpcInvokeMap = {
  'weread:get-settings': {
    args: [];
    result: WeReadSettings;
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
};
