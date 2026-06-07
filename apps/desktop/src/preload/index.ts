import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentDistillationReviewPayload,
  AgentMessagePayload,
  AgentReviewPayload,
  AgentMentionInstructionPayload,
  Annotation,
  AnnotationDistillationReviewMessage,
  AssistantRuntimeProgressEvent,
  AppSettings,
  ArticleRecord,
  ArticleReadingProgress,
  Comment,
  DesktopStore,
  LlmProvider,
  ReaderChatState,
  UserProfile,
} from '@yomitomo/shared';
import type { AppUpdateState } from '../app-update-types';
import { DesktopStoreLoadError } from '../app-store-errors';
import type {
  DataManagementPathKind,
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
  EbookImportFileInput,
  AnnotationDiscussionWindowOpenInput,
  AnnotationSedimentationWindowOpenInput,
  AnnotationSedimentationCommitInput,
  AnnotationDistillationCommittedEvent,
  AnnotationDiscussionWindowStateEvent,
  AssistantExecutionQueryInput,
  AgentRuntimeTraceListInput,
  PerformanceTimingInput,
  ArticleImportUrlInput,
  PdfImportFileInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
} from '../ipc-contract';

export type {
  AppInfo,
  AgentRuntimeTraceEntry,
  AgentRuntimeTraceListInput,
  AgentRuntimeTraceTaskType,
  AnnotationDiscussionWindowOpenInput,
  AnnotationDiscussionWindowOpenResult,
  AnnotationDiscussionWindowState,
  AnnotationDiscussionWindowStateEvent,
  AnnotationDiscussionWindowsCloseArticleInput,
  AnnotationDiscussionWindowsCloseArticleResult,
  AnnotationSedimentationWindowOpenInput,
  AnnotationSedimentationWindowOpenResult,
  AnnotationSedimentationCommitInput,
  AnnotationSedimentationCommitResult,
  AnnotationDistillationCommitTransition,
  AnnotationDistillationCommittedEvent,
  AssistantExecutionQueryInput,
  AssistantExecutionRun,
  AssistantExecutionStatus,
  AssistantExecutionSummary,
  AssistantExecutionSummaryGroup,
  AssistantExecutionTotals,
  AssistantExecutionUsage,
  ArticleAnnotationDeleteInput,
  ArticleAnnotationUpsertInput,
  ArticleCommentDeleteInput,
  ArticleCommentUpsertInput,
  ArticleImportResult,
  ArticleImportUrlInput,
  ArticleReaderChatStateSaveInput,
  DataManagementPathKind,
  DataManagementPaths,
  DatabaseBackupResult,
  DatabaseRestoreResult,
  EbookImportFileInput,
  PerformanceTimingInput,
  PdfImportFileInput,
  WeReadOpenTarget,
  WeReadReadingStatsQueryInput,
  WeReadSaveSettingsInput,
} from '../ipc-contract';

const preloadLoadedAt = performance.now();

function articleImportUrlInput(url: string, requestId?: string): ArticleImportUrlInput {
  return requestId ? { url, requestId } : url;
}

const api = {
  platform: process.platform,
  startupTiming: {
    preloadLoadedAt,
  },
  getAppInfo: () => invokeDesktopIpc('app:info'),
  showMainWindow: () => ipcRenderer.send('app:renderer-ready'),
  getStateResult: () => invokeDesktopIpc('store:get'),
  getState: async () => {
    const result = await invokeDesktopIpc('store:get');
    if (result.ok) return result.store;
    throw new DesktopStoreLoadError(result.error);
  },
  onStoreUpdated: (callback: (store: DesktopStore) => void) => {
    const listener = (_event: IpcRendererEvent, store: DesktopStore) => callback(store);
    ipcRenderer.on('store:updated', listener);
    return () => ipcRenderer.removeListener('store:updated', listener);
  },
  saveUser: (user: Partial<UserProfile>) => invokeDesktopIpc('user:save', user),
  saveSettings: (settings: AppSettings) => invokeDesktopIpc('settings:save', settings),
  saveProvider: (provider: Partial<LlmProvider> & { removeApiKey?: boolean }) =>
    invokeDesktopIpc('provider:save', provider),
  deleteProvider: (id: string) => invokeDesktopIpc('provider:delete', id),
  readProviderApiKey: (providerId: string) => invokeDesktopIpc('provider:read-api-key', providerId),
  testProvider: (provider: Partial<LlmProvider>) => invokeDesktopIpc('provider:test', provider),
  listProviderModels: (provider: Partial<LlmProvider>) =>
    invokeDesktopIpc('provider:list-models', provider),
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
  ) => {
    const listener = (_event: IpcRendererEvent, state: AnnotationDiscussionWindowStateEvent) =>
      callback(state);
    ipcRenderer.on('annotation-discussion:window-state', listener);
    return () => {
      ipcRenderer.removeListener('annotation-discussion:window-state', listener);
    };
  },
  onAnnotationDistillationCommitted: (
    callback: (event: AnnotationDistillationCommittedEvent) => void,
  ) => {
    const listener = (_event: IpcRendererEvent, event: AnnotationDistillationCommittedEvent) =>
      callback(event);
    ipcRenderer.on('annotation-distillation:committed', listener);
    return () => {
      ipcRenderer.removeListener('annotation-distillation:committed', listener);
    };
  },
  onAnnotationWindowClosing: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('annotation-window:closing', listener);
    return () => {
      ipcRenderer.removeListener('annotation-window:closing', listener);
    };
  },
  planAgentMentionRoute: (payload: AgentMentionInstructionPayload) =>
    invokeDesktopIpc('agent:mention-route', payload),
  getLogPath: () => invokeDesktopIpc('log:path'),
  readLog: () => invokeDesktopIpc('log:read'),
  clearLog: () => invokeDesktopIpc('log:clear'),
  getAgentRuntimeTracePath: () => invokeDesktopIpc('agent-trace:path'),
  listAgentRuntimeTraces: (input?: AgentRuntimeTraceListInput) =>
    invokeDesktopIpc('agent-trace:list', input),
  clearAgentRuntimeTraces: () => invokeDesktopIpc('agent-trace:clear'),
  listAssistantExecutions: (input: AssistantExecutionQueryInput) =>
    invokeDesktopIpc('assistant-executions:list', input),
  summarizeAssistantExecutions: (input: AssistantExecutionQueryInput) =>
    invokeDesktopIpc('assistant-executions:summary', input),
  getDataManagementPaths: () => invokeDesktopIpc('data:paths'),
  openDataManagementPath: (kind: DataManagementPathKind) =>
    invokeDesktopIpc('data:open-path', kind),
  backupDatabase: () => invokeDesktopIpc('data:database-backup'),
  restoreDatabase: () => invokeDesktopIpc('data:database-restore'),
  recordPerformanceTiming: (input: PerformanceTimingInput) =>
    invokeDesktopIpc('performance:timing', input),
  getUpdateStatus: () => invokeDesktopIpc('updates:get-status'),
  checkForUpdates: () => invokeDesktopIpc('updates:check'),
  downloadUpdate: () => invokeDesktopIpc('updates:download'),
  installUpdate: () => invokeDesktopIpc('updates:install'),
  simulateUpdateAvailable: () => invokeDesktopIpc('updates:simulate-available'),
  getReleaseNote: (
    version: string,
    source: 'local' | 'remote',
    language?: AppSettings['uiLanguage'],
  ) => invokeDesktopIpc('release-notes:get', { version, source, language }),
  onUpdateStatus: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: IpcRendererEvent, state: AppUpdateState) => callback(state);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  openUrl: (url: string) => invokeDesktopIpc('url:open', url),
  getArticle: (id: string) => invokeDesktopIpc('article:get', id),
  getArticleCover: (id: string) => invokeDesktopIpc('article:get-cover', id),
  getArticleSiteIcon: (id: string) => invokeDesktopIpc('article:get-site-icon', id),
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
  importArticleUrl: (url: string, requestId?: string) =>
    invokeDesktopIpc('article:import-url', articleImportUrlInput(url, requestId)),
  cancelArticleUrlImport: (requestId: string) =>
    invokeDesktopIpc('article:import-url-cancel', requestId),
  importEbookFile: (input: EbookImportFileInput) => invokeDesktopIpc('ebook:import-file', input),
  readEbookFile: (articleId: string) => invokeDesktopIpc('ebook:read-file', articleId),
  importPdfFile: (input: PdfImportFileInput) => invokeDesktopIpc('pdf:import-file', input),
  readPdfFile: (articleId: string) => invokeDesktopIpc('pdf:read-file', articleId),
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
  deleteArticle: (id: string) => invokeDesktopIpc('article:delete', id),
  requestAgentComment: (payload: AgentMessagePayload) => invokeDesktopIpc('agent:comment', payload),
  requestAgentReview: (payload: AgentReviewPayload) => invokeDesktopIpc('agent:review', payload),
  requestAgentDistillationReview: (payload: AgentDistillationReviewPayload) =>
    invokeDesktopIpc('agent:distillation-review', payload),
  requestAgentDistillationReviewStream: (
    payload: AgentDistillationReviewPayload,
    onEvent: (
      event:
        | { type: 'start'; message: AnnotationDistillationReviewMessage }
        | { type: 'delta'; delta: string }
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
          | { type: 'progress'; progress: AssistantRuntimeProgressEvent }
          | { type: 'done'; message: AnnotationDistillationReviewMessage }
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'delta' || message.type === 'progress') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done') resolve(message.message);
        else reject(new Error(message.message));
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
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'delta' || message.type === 'progress') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done') resolve(message.comment);
        else reject(new Error(message.message));
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
      event: { type: 'start' } | { type: 'item'; annotation: ArticleRecord['annotations'][number] },
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
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'item') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done')
          resolve({ annotations: message.annotations, readingMemory: message.readingMemory });
        else reject(new Error(message.message));
      };
      ipcRenderer.on(channel, listener);
      ipcRenderer.send('agent:annotate:stream', { requestId, payload });
    });
  },
  saveAgent: (agent: Partial<Agent>) => invokeDesktopIpc('agent:save', agent),
  deleteAgent: (id: string) => invokeDesktopIpc('agent:delete', id),
};

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;

function invokeDesktopIpc<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  ...args: DesktopIpcInvokeArgs<Channel>
): Promise<DesktopIpcInvokeResult<Channel>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<DesktopIpcInvokeResult<Channel>>;
}

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
