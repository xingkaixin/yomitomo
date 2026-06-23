import { ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMentionInstructionPayload,
  AgentMessagePayload,
  AgentReviewPayload,
  Annotation,
  AnnotationDistillationReviewItem,
  AnnotationDistillationReviewMessage,
  AppSettings,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleStorePatch,
  ArticleTranslation,
  ArticleTranslationDeleteRequest,
  ArticleTranslationRequest,
  AssistantRuntimeProgressEvent,
  Comment,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
  LlmProvider,
  ReaderChatState,
  UserProfile,
} from '@yomitomo/shared';
import type { AppUpdateState, AppUpdateTrigger } from '../app-update-types';
import { DesktopStoreLoadError } from '../app-store-errors';
import {
  desktopIpcErrorFromSerialized,
  type DesktopIpcInvokeEnvelope,
  type SerializedDesktopIpcError,
} from '../ipc-errors';
import type {
  AgentRuntimeTraceListInput,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDistillationCommittedEvent,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationWindowOpenInput,
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
  EbookImportFileInput,
  PdfImportFileInput,
  PerformanceTimingInput,
  RemoveCollectionMemberInput,
  RenameCollectionInput,
  SetLibraryPinInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
  WeReadState,
} from '../ipc-contract';

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
    showMainWindow: () => ipcRenderer.send('app:renderer-ready'),
    openUrl: (url: string) => invokeDesktopIpc('url:open', url),
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
      onIpcEvent('store:updated', (store) => callback(store as DesktopStore)),
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
    ) =>
      onIpcEvent('annotation-discussion:window-state', (event) =>
        callback(event as AnnotationDiscussionWindowStateEvent),
      ),
    onAnnotationDistillationCommitted: (
      callback: (event: AnnotationDistillationCommittedEvent) => void,
    ) =>
      onIpcEvent('annotation-distillation:committed', (event) =>
        callback(event as AnnotationDistillationCommittedEvent),
      ),
    onAnnotationWindowClosing: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('annotation-window:closing', listener);
      return () => {
        ipcRenderer.removeListener('annotation-window:closing', listener);
      };
    },
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
      onIpcEvent('updates:status', (state) => callback(state as AppUpdateState)),
  };
}

function createArticlePreloadApi() {
  return {
    onArticlePatched: (callback: (patch: ArticleStorePatch) => void) =>
      onIpcEvent('article:patched', (patch) => callback(patch as ArticleStorePatch)),
    getArticle: (id: string) => invokeDesktopIpc('article:get', id),
    getArticleCover: (id: string) => invokeDesktopIpc('article:get-cover', id),
    getArticleSiteIcon: (id: string) => invokeDesktopIpc('article:get-site-icon', id),
    listLibraryArticles: (input: ArticleLibraryListInput) =>
      invokeDesktopIpc('article:list-library', input),
    readArticleStatsSummaries: () => invokeDesktopIpc('article:stats-summaries'),
    getPdfThumbnail: (id: string) => invokeDesktopIpc('pdf:get-thumbnail', id),
    saveArticle: (article: ArticleRecord) => invokeDesktopIpc('article:save', article),
    saveArticleAnnotation: (articleId: string, annotation: Annotation, updatedAt?: string) =>
      invokeDesktopIpc('article:save-annotation', { articleId, annotation, updatedAt }),
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
      onIpcEvent('article-translation:updated', (translation) =>
        callback(translation as ArticleTranslation),
      ),
    importArticleUrl: (url: string, requestId?: string) =>
      invokeDesktopIpc('article:import-url', articleImportUrlInput(url, requestId)),
    cancelArticleUrlImport: (requestId: string) =>
      invokeDesktopIpc('article:import-url-cancel', requestId),
    importEbookFile: (input: EbookImportFileInput) => invokeDesktopIpc('ebook:import-file', input),
    readEbookFile: (articleId: string) => invokeDesktopIpc('ebook:read-file', articleId),
    importPdfFile: (input: PdfImportFileInput) => invokeDesktopIpc('pdf:import-file', input),
    readPdfFile: (articleId: string) => invokeDesktopIpc('pdf:read-file', articleId),
    deleteArticle: (id: string) => invokeDesktopIpc('article:delete', id),
  };
}

function createLibraryCollectionPreloadApi() {
  return {
    onCollectionPatched: (callback: (patch: CollectionStorePatch) => void) =>
      onIpcEvent('collection:patched', (patch) => callback(patch as CollectionStorePatch)),
    onLibraryPinPatched: (callback: (patch: LibraryPinPatch) => void) =>
      onIpcEvent('library-pin:patched', (patch) => callback(patch as LibraryPinPatch)),
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
      onIpcEvent('weread:state-updated', (state) => callback(state as WeReadState)),
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
      onEvent: (
        event:
          | { type: 'start'; message: AnnotationDistillationReviewMessage }
          | { type: 'delta'; delta: string }
          | { type: 'item'; item: AnnotationDistillationReviewItem }
          | { type: 'progress'; progress: AssistantRuntimeProgressEvent },
      ) => void,
    ) => {
      const requestId = makeRequestId();
      const channel = `agent:distillation-review:stream:${requestId}`;
      return new Promise<AnnotationDistillationReviewMessage>((resolve, reject) => {
        const listener = (
          _event: IpcRendererEvent,
          message:
            | { type: 'start'; message: AnnotationDistillationReviewMessage }
            | { type: 'delta'; delta: string }
            | { type: 'item'; item: AnnotationDistillationReviewItem }
            | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
            | { type: 'done'; message: AnnotationDistillationReviewMessage }
            | { type: 'error'; message: string; error?: SerializedDesktopIpcError },
        ) => {
          if (
            message.type === 'start' ||
            message.type === 'delta' ||
            message.type === 'item' ||
            message.type === 'progress'
          ) {
            onEvent(message);
            return;
          }
          ipcRenderer.removeListener(channel, listener);
          if (message.type === 'done') resolve(message.message);
          else
            reject(
              message.error
                ? desktopIpcErrorFromSerialized(message.error)
                : new Error(message.message),
            );
        };
        ipcRenderer.on(channel, listener);
        ipcRenderer.send('agent:distillation-review:stream', { requestId, payload });
      });
    },
    requestAgentCommentStream: (
      payload: AgentMessagePayload,
      onEvent: (
        event:
          | { type: 'start'; comment: Comment }
          | { type: 'delta'; delta: string }
          | { type: 'progress'; progress: AssistantRuntimeProgressEvent },
      ) => void,
    ) => {
      const requestId = makeRequestId();
      const channel = `agent:comment:stream:${requestId}`;
      return new Promise<Comment>((resolve, reject) => {
        const listener = (
          _event: IpcRendererEvent,
          message:
            | { type: 'start'; comment: Comment }
            | { type: 'delta'; delta: string }
            | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
            | { type: 'done'; comment: Comment }
            | { type: 'error'; message: string; error?: SerializedDesktopIpcError },
        ) => {
          if (message.type === 'start' || message.type === 'delta' || message.type === 'progress') {
            onEvent(message);
            return;
          }
          ipcRenderer.removeListener(channel, listener);
          if (message.type === 'done') resolve(message.comment);
          else
            reject(
              message.error
                ? desktopIpcErrorFromSerialized(message.error)
                : new Error(message.message),
            );
        };
        ipcRenderer.on(channel, listener);
        ipcRenderer.send('agent:comment:stream', { requestId, payload });
      });
    },
    requestAgentAnnotations: (payload: AgentAnnotatePayload) =>
      invokeDesktopIpc('agent:annotate', payload),
    requestAgentAnnotationsStream: (
      payload: AgentAnnotatePayload,
      onEvent: (
        event:
          | { type: 'start' }
          | { type: 'item'; annotation: ArticleRecord['annotations'][number] },
      ) => void,
    ) => {
      const requestId = makeRequestId();
      const channel = `agent:annotate:stream:${requestId}`;
      return new Promise<AgentAnnotateResult>((resolve, reject) => {
        const listener = (
          _event: IpcRendererEvent,
          message:
            | { type: 'start' }
            | { type: 'item'; annotation: ArticleRecord['annotations'][number] }
            | {
                type: 'done';
                annotations: ArticleRecord['annotations'];
                readingMemory?: AgentAnnotateResult['readingMemory'];
              }
            | { type: 'error'; message: string; error?: SerializedDesktopIpcError },
        ) => {
          if (message.type === 'start' || message.type === 'item') {
            onEvent(message);
            return;
          }
          ipcRenderer.removeListener(channel, listener);
          if (message.type === 'done')
            resolve({ annotations: message.annotations, readingMemory: message.readingMemory });
          else
            reject(
              message.error
                ? desktopIpcErrorFromSerialized(message.error)
                : new Error(message.message),
            );
        };
        ipcRenderer.on(channel, listener);
        ipcRenderer.send('agent:annotate:stream', { requestId, payload });
      });
    },
    saveAgent: (agent: Partial<Agent>) => invokeDesktopIpc('agent:save', agent),
    deleteAgent: (id: string) => invokeDesktopIpc('agent:delete', id),
  };
}

function onIpcEvent(channel: string, callback: (payload: unknown) => void) {
  const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

function articleImportUrlInput(url: string, requestId?: string): ArticleImportUrlInput {
  return requestId ? { url, requestId } : url;
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

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
