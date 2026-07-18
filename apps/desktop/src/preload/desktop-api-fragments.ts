import { ipcRenderer } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentDistillationReviewPayload,
  AgentMentionInstructionPayload,
  AgentMessagePayload,
  AgentReviewPayload,
  Annotation,
  AppSettings,
  ArticleReadingProgress,
  ArticleStorePatch,
  ArticleTranslation,
  ArticleTranslationDeleteRequest,
  ArticleTranslationRequest,
  Comment,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
  LlmProvider,
  ReaderChatState,
  UserProfile,
} from '@yomitomo/shared';
import type { AppUpdateState, AppUpdateTrigger } from '../app-update-types';
import type { AppMenuCommand } from '../app-menu-types';
import { DesktopStoreLoadError } from '../app-store-errors';
import { desktopIpcErrorFromSerialized, type DesktopIpcInvokeEnvelope } from '../ipc-errors';
import type {
  AgentRuntimeTraceListInput,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDistillationCommittedEvent,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationWindowOpenInput,
  ArticleAgentAnnotationMergeInput,
  ArticleAnnotationDistillationSaveInput,
  AppLockSetEnabledInput,
  AppLockSetLockedInput,
  AppLockSetPinInput,
  AppLockSetShortcutInput,
  AppLockUnlockInput,
  AppLockVerifyPinInput,
  AddCollectionMembersInput,
  ArticleImportUrlInput,
  ArticleLibraryListInput,
  AssistantExecutionQueryInput,
  CreateCollectionInput,
  DataManagementPathKind,
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
  DesktopIpcStreamProgressEvent,
  DistillationLibraryListInput,
  EbookImportFileInput,
  LibraryCatalogListInput,
  PdfImportFileInput,
  TextImportPrepareInput,
  TextImportCommitInput,
  PerformanceTimingInput,
  RemoveCollectionMemberInput,
  RenameCollectionInput,
  SetLibraryPinInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
  WeReadState,
} from '../ipc-contract';
import {
  electronDesktopIpcStreamTransport,
  onDesktopIpcRendererEvent,
  sendDesktopIpcMainEvent,
} from './ipc-events';
import { createDesktopIpcStreamClient } from './ipc-stream-client';

const desktopIpcStreamClient = createDesktopIpcStreamClient(electronDesktopIpcStreamTransport);

export type DesktopPreloadApiInput = {
  platform: NodeJS.Platform;
  preloadLoadedAt: number;
};

export function createYomitomoDesktopApi(input: DesktopPreloadApiInput) {
  return {
    platform: input.platform,
    pdfiumWasmUrl: readPdfiumWasmUrl(),
    startupTiming: {
      preloadLoadedAt: input.preloadLoadedAt,
    },
    ...createAppPreloadApi(),
    ...createStorePreloadApi(),
    ...createAppLockPreloadApi(),
    ...createProviderPreloadApi(),
    ...createAnnotationWindowPreloadApi(),
    ...createDiagnosticsPreloadApi(),
    ...createDataPreloadApi(),
    ...createUpdatePreloadApi(),
    ...createArticlePreloadApi(),
    ...createLibraryCollectionPreloadApi(),
    ...createWeReadPreloadApi(),
    ...createAgentPreloadApi(),
  };
}

function readPdfiumWasmUrl() {
  const value = ipcRenderer.sendSync('app:pdfium-wasm-url');
  if (typeof value !== 'string' || !value) throw new Error('PDFIUM_WASM_URL_UNAVAILABLE');
  return value;
}

function createAppPreloadApi() {
  return {
    getAppInfo: () => invokeDesktopIpc('app:info'),
    showMainWindow: () => sendDesktopIpcMainEvent('app:renderer-ready'),
    openUrl: (url: string) => invokeDesktopIpc('url:open', url),
    onAppMenuCommand: (callback: (command: AppMenuCommand) => void) =>
      onDesktopIpcRendererEvent('app-menu:command', (command) => {
        if (isAppMenuCommand(command)) callback(command);
      }),
  };
}

function createStorePreloadApi() {
  return {
    getStateResult: () => invokeDesktopIpc('store:get'),
    getState: async () => {
      const result = await invokeDesktopIpc('store:get');
      if (result.ok) return result.store;
      throw new DesktopStoreLoadError(result.error);
    },
    onStoreUpdated: (callback: (store: DesktopStore) => void) =>
      onDesktopIpcRendererEvent('store:updated', callback),
    saveUser: (user: Partial<UserProfile>) => invokeDesktopIpc('user:save', user),
    saveSettings: (settings: AppSettings) => invokeDesktopIpc('settings:save', settings),
  };
}

function createAppLockPreloadApi() {
  return {
    getAppLockStatus: () => invokeDesktopIpc('appLock:getStatus'),
    setAppLockPin: (input: AppLockSetPinInput) => invokeDesktopIpc('appLock:setPin', input),
    verifyAppLockPin: (input: AppLockVerifyPinInput) =>
      invokeDesktopIpc('appLock:verifyPin', input),
    unlockAppLock: (input: AppLockUnlockInput) => invokeDesktopIpc('appLock:unlock', input),
    setAppLockEnabled: (input: AppLockSetEnabledInput) =>
      invokeDesktopIpc('appLock:setEnabled', input),
    setAppLockLocked: (input: AppLockSetLockedInput) =>
      invokeDesktopIpc('appLock:setLocked', input),
    setAppLockShortcut: (input: AppLockSetShortcutInput) =>
      invokeDesktopIpc('appLock:setShortcut', input),
  };
}

function createProviderPreloadApi() {
  return {
    saveProvider: (provider: Partial<LlmProvider> & { removeApiKey?: boolean }) =>
      invokeDesktopIpc('provider:save', provider),
    deleteProvider: (id: string) => invokeDesktopIpc('provider:delete', id),
    readProviderApiKey: (providerId: string) =>
      invokeDesktopIpc('provider:read-api-key', providerId),
    testProvider: (provider: Partial<LlmProvider>) => invokeDesktopIpc('provider:test', provider),
    listProviderModels: (provider: Partial<LlmProvider>) =>
      invokeDesktopIpc('provider:list-models', provider),
  };
}

function createAnnotationWindowPreloadApi() {
  return {
    openAnnotationDiscussion: (input: AnnotationDiscussionWindowOpenInput) =>
      invokeDesktopIpc('annotation-discussion:open', input),
    openAnnotationSedimentation: (input: AnnotationSedimentationWindowOpenInput) =>
      invokeDesktopIpc('annotation-sedimentation:open', input),
    commitAnnotationSedimentation: (input: AnnotationSedimentationCommitInput) =>
      invokeDesktopIpc('annotation-sedimentation:commit', input),
    closeArticleAnnotationDiscussions: (articleId: string) =>
      invokeDesktopIpc('annotation-discussion:close-article', { articleId }),
    onAnnotationDiscussionWindowState: (
      callback: (event: AnnotationDiscussionWindowStateEvent) => void,
    ) => onDesktopIpcRendererEvent('annotation-discussion:window-state', callback),
    onAnnotationDistillationCommitted: (
      callback: (event: AnnotationDistillationCommittedEvent) => void,
    ) => onDesktopIpcRendererEvent('annotation-distillation:committed', callback),
    onAnnotationWindowClosing: (callback: () => void) =>
      onDesktopIpcRendererEvent('annotation-window:closing', callback),
  };
}

function createDiagnosticsPreloadApi() {
  return {
    getLogPath: () => invokeDesktopIpc('log:path'),
    readLog: () => invokeDesktopIpc('log:read'),
    clearLog: () => invokeDesktopIpc('log:clear'),
    getAgentRuntimeTracePath: () => invokeDesktopIpc('agent-trace:path'),
    listAgentRuntimeTraces: (input?: AgentRuntimeTraceListInput) =>
      invokeDesktopIpc('agent-trace:list', input),
    clearAgentRuntimeTraces: () => invokeDesktopIpc('agent-trace:clear'),
    listAssistantExecutions: (input: AssistantExecutionQueryInput) =>
      invokeDesktopIpc('assistant-executions:list', input),
    getAssistantExecutionDetail: (id: string) =>
      invokeDesktopIpc('assistant-executions:detail', id),
    summarizeAssistantExecutions: (input: AssistantExecutionQueryInput) =>
      invokeDesktopIpc('assistant-executions:summary', input),
    recordPerformanceTiming: (input: PerformanceTimingInput) =>
      invokeDesktopIpc('performance:timing', input),
  };
}

function createDataPreloadApi() {
  return {
    getDataManagementPaths: () => invokeDesktopIpc('data:paths'),
    openDataManagementPath: (kind: DataManagementPathKind) =>
      invokeDesktopIpc('data:open-path', kind),
    backupDatabase: () => invokeDesktopIpc('data:database-backup'),
    restoreDatabase: () => invokeDesktopIpc('data:database-restore'),
  };
}

function createUpdatePreloadApi() {
  return {
    getUpdateStatus: () => invokeDesktopIpc('updates:get-status'),
    checkForUpdates: () => invokeDesktopIpc('updates:check'),
    downloadUpdate: () => invokeDesktopIpc('updates:download'),
    installUpdate: () => invokeDesktopIpc('updates:install'),
    simulateUpdateAvailable: (trigger?: AppUpdateTrigger) =>
      invokeDesktopIpc('updates:simulate-available', trigger),
    getReleaseNote: (
      version: string,
      source: 'local' | 'remote',
      language?: AppSettings['uiLanguage'],
    ) => invokeDesktopIpc('release-notes:get', { version, source, language }),
    onUpdateStatus: (callback: (state: AppUpdateState) => void) =>
      onDesktopIpcRendererEvent('updates:status', callback),
  };
}

function createArticlePreloadApi() {
  return {
    onArticlePatched: (callback: (patch: ArticleStorePatch) => void) =>
      onDesktopIpcRendererEvent('article:patched', callback),
    getArticle: (id: string) => invokeDesktopIpc('article:get', id),
    getArticleCover: (id: string) => invokeDesktopIpc('article:get-cover', id),
    getArticleSiteIcon: (id: string) => invokeDesktopIpc('article:get-site-icon', id),
    listLibraryArticles: (input: ArticleLibraryListInput) =>
      invokeDesktopIpc('article:list-library', input),
    readArticleStatsSummaries: () => invokeDesktopIpc('article:stats-summaries'),
    getPdfThumbnail: (id: string) => invokeDesktopIpc('pdf:get-thumbnail', id),
    mergeArticleAgentAnnotation: (input: ArticleAgentAnnotationMergeInput) =>
      invokeDesktopIpc('article:merge-agent-annotation', input),
    saveArticleAnnotation: (articleId: string, annotation: Annotation, updatedAt?: string) =>
      invokeDesktopIpc('article:save-annotation', { articleId, annotation, updatedAt }),
    saveArticleAnnotationDistillation: (input: ArticleAnnotationDistillationSaveInput) =>
      invokeDesktopIpc('article:save-annotation-distillation', input),
    saveArticleComment: (
      articleId: string,
      annotationId: string,
      comment: Comment,
      updatedAt?: string,
    ) => invokeDesktopIpc('article:save-comment', { articleId, annotationId, comment, updatedAt }),
    deleteArticleAnnotation: (articleId: string, annotationId: string) =>
      invokeDesktopIpc('article:delete-annotation', { articleId, annotationId }),
    deleteArticleComment: (articleId: string, annotationId: string, commentId: string) =>
      invokeDesktopIpc('article:delete-comment', { articleId, annotationId, commentId }),
    saveArticleReadingProgress: (articleId: string, progress: ArticleReadingProgress) =>
      invokeDesktopIpc('article:reading-progress', {
        articleId,
        progress,
      }),
    saveArticleReaderChatState: (articleId: string, readerChatState?: ReaderChatState) =>
      invokeDesktopIpc('article:reader-chat-state', {
        articleId,
        readerChatState,
      }),
    getCurrentArticleTranslation: (input: ArticleTranslationRequest) =>
      invokeDesktopIpc('article-translation:get-current', input),
    translateArticle: (input: ArticleTranslationRequest) =>
      invokeDesktopIpc('article-translation:translate', input),
    deleteCurrentArticleTranslation: (input: ArticleTranslationDeleteRequest) =>
      invokeDesktopIpc('article-translation:delete-current', input),
    onArticleTranslationUpdated: (callback: (translation: ArticleTranslation) => void) =>
      onDesktopIpcRendererEvent('article-translation:updated', callback),
    importArticleUrl: (url: string, requestId?: string) =>
      invokeDesktopIpc('article:import-url', articleImportUrlInput(url, requestId)),
    cancelArticleUrlImport: (requestId: string) =>
      invokeDesktopIpc('article:import-url-cancel', requestId),
    importEbookFile: (input: EbookImportFileInput) => invokeDesktopIpc('ebook:import-file', input),
    readEbookFile: (articleId: string) => invokeDesktopIpc('ebook:read-file', articleId),
    importPdfFile: (input: PdfImportFileInput) => invokeDesktopIpc('pdf:import-file', input),
    readPdfFile: (articleId: string) => invokeDesktopIpc('pdf:read-file', articleId),
    prepareTextImport: (input: TextImportPrepareInput) =>
      invokeDesktopIpc('text:import-prepare', input),
    commitTextImport: (input: TextImportCommitInput) =>
      invokeDesktopIpc('text:import-commit', input),
    deleteArticle: (id: string) => invokeDesktopIpc('article:delete', id),
  };
}

function createLibraryCollectionPreloadApi() {
  return {
    listDistillationLibrary: (input: DistillationLibraryListInput) =>
      invokeDesktopIpc('distillation-library:list', input),
    listLibraryCatalog: (input: LibraryCatalogListInput) =>
      invokeDesktopIpc('library-catalog:list', input),
    onCollectionPatched: (callback: (patch: CollectionStorePatch) => void) =>
      onDesktopIpcRendererEvent('collection:patched', callback),
    onLibraryPinPatched: (callback: (patch: LibraryPinPatch) => void) =>
      onDesktopIpcRendererEvent('library-pin:patched', callback),
    listCollections: () => invokeDesktopIpc('library-collection:list'),
    createCollection: (input: CreateCollectionInput) =>
      invokeDesktopIpc('library-collection:create', input),
    renameCollection: (input: RenameCollectionInput) =>
      invokeDesktopIpc('library-collection:rename', input),
    deleteCollection: (collectionId: string) =>
      invokeDesktopIpc('library-collection:delete', collectionId),
    addCollectionMembers: (input: AddCollectionMembersInput) =>
      invokeDesktopIpc('library-collection:add-members', input),
    removeCollectionMember: (input: RemoveCollectionMemberInput) =>
      invokeDesktopIpc('library-collection:remove-member', input),
    listLibraryPins: () => invokeDesktopIpc('library-pin:list'),
    setLibraryPin: (input: SetLibraryPinInput) => invokeDesktopIpc('library-pin:set', input),
  };
}

function createWeReadPreloadApi() {
  return {
    getWeReadSettings: () => invokeDesktopIpc('weread:get-settings'),
    getWeReadState: () => invokeDesktopIpc('weread:get-state'),
    readWeReadApiKey: () => invokeDesktopIpc('weread:read-api-key'),
    saveWeReadSettings: (input: WeReadSaveSettingsInput) =>
      invokeDesktopIpc('weread:save-settings', input),
    testWeRead: (apiKey?: string) => invokeDesktopIpc('weread:test', apiKey),
    syncWeRead: () => invokeDesktopIpc('weread:sync'),
    syncWeReadBook: (bookId: string) => invokeDesktopIpc('weread:sync-book', bookId),
    getWeReadBook: (bookId: string) => invokeDesktopIpc('weread:get-book', bookId),
    openWeRead: (target: WeReadOpenTarget) => invokeDesktopIpc('weread:open', target),
    getWeReadReadingStats: () => invokeDesktopIpc('weread:get-reading-stats'),
    queryWeReadReadingStats: (input: WeReadReadingStatsQueryInput) =>
      invokeDesktopIpc('weread:query-reading-stats', input),
    onWeReadStateUpdated: (callback: (state: WeReadState) => void) =>
      onDesktopIpcRendererEvent('weread:state-updated', callback),
  };
}

function createAgentPreloadApi() {
  return {
    planAgentMentionRoute: (payload: AgentMentionInstructionPayload) =>
      invokeDesktopIpc('agent:mention-route', payload),
    requestAgentComment: (payload: AgentMessagePayload) =>
      invokeDesktopIpc('agent:comment', payload),
    requestAgentReview: (payload: AgentReviewPayload) => invokeDesktopIpc('agent:review', payload),
    requestAgentDistillationReview: (payload: AgentDistillationReviewPayload) =>
      invokeDesktopIpc('agent:distillation-review', payload),
    requestAgentDistillationReviewStream: (
      payload: AgentDistillationReviewPayload,
      onEvent: (event: DesktopIpcStreamProgressEvent<'agent:distillation-review:stream'>) => void,
    ) =>
      desktopIpcStreamClient.request(
        'agent:distillation-review:stream',
        payload,
        onEvent,
        (event) => event.message,
      ),
    requestAgentCommentStream: (
      payload: AgentMessagePayload,
      onEvent: (event: DesktopIpcStreamProgressEvent<'agent:comment:stream'>) => void,
    ) =>
      desktopIpcStreamClient.request(
        'agent:comment:stream',
        payload,
        onEvent,
        (event) => event.comment,
      ),
    requestAgentAnnotations: (payload: AgentAnnotatePayload) =>
      invokeDesktopIpc('agent:annotate', payload),
    requestAgentAnnotationsStream: (
      payload: AgentAnnotatePayload,
      onEvent: (event: DesktopIpcStreamProgressEvent<'agent:annotate:stream'>) => void,
    ) =>
      desktopIpcStreamClient.request('agent:annotate:stream', payload, onEvent, (event) => ({
        annotations: event.annotations,
        readingMemory: event.readingMemory,
      })),
    saveAgent: (agent: Partial<Agent>) => invokeDesktopIpc('agent:save', agent),
    deleteAgent: (id: string) => invokeDesktopIpc('agent:delete', id),
  };
}

function articleImportUrlInput(url: string, requestId?: string): ArticleImportUrlInput {
  return requestId ? { url, requestId } : url;
}

function isAppMenuCommand(value: unknown): value is AppMenuCommand {
  return (
    value === 'backup-database' ||
    value === 'check-updates' ||
    value === 'import-ebook' ||
    value === 'import-pdf' ||
    value === 'import-web' ||
    value === 'open-about' ||
    value === 'open-release-notes' ||
    value === 'open-settings' ||
    value === 'open-help-docs' ||
    value === 'report-issue' ||
    value === 'restore-database' ||
    value === 'sync-weread'
  );
}

function invokeDesktopIpc<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  ...args: DesktopIpcInvokeArgs<Channel>
): Promise<DesktopIpcInvokeResult<Channel>> {
  return ipcRenderer.invoke(channel, ...args).then((result) => {
    const envelope = result as DesktopIpcInvokeEnvelope<DesktopIpcInvokeResult<Channel>>;
    if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
      if (envelope.ok) return envelope.value;
      throw desktopIpcErrorFromSerialized(envelope.error);
    }
    return result as DesktopIpcInvokeResult<Channel>;
  });
}
