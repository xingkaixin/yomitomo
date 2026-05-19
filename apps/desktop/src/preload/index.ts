import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentAnnotateResult,
  AgentMessagePayload,
  AgentReviewPayload,
  AnnotationMetadata,
  AnnotationMetadataPayload,
  AppSettings,
  ArticleDeletePatch,
  ArticleRecord,
  ArticleReadingProgress,
  ArticleReadingProgressPatch,
  Comment,
  DesktopStore,
  FocusCoReadingRoutePayload,
  FocusCoReadingRouteResult,
  LlmProvider,
  ProviderModel,
  UserProfile,
} from '@yomitomo/shared';
import type { AppUpdateState } from '../app-update-types';
import { DesktopStoreLoadError, type DesktopStoreGetResult } from '../app-store-errors';

export type ArticleImportResult = {
  status: 'imported' | 'duplicate';
  article: ArticleRecord;
  store: DesktopStore;
};

export type EbookImportFileInput = {
  fileName: string;
  mimeType?: string;
  data: ArrayBuffer;
};

export type AppInfo = {
  desktopVersion: string;
};

export type PerformanceTimingInput = {
  event: string;
  data?: Record<string, unknown>;
};

export type DataManagementPathKind = 'dataDir' | 'logFile' | 'databaseFile';

export type DataManagementPaths = {
  dataDir: string;
  logFile: string;
  databaseFile: string;
};

export type DatabaseBackupResult = { canceled: true } | { canceled: false; filePath: string };

export type DatabaseRestoreResult =
  | { canceled: true }
  | { canceled: false; backupPath: string; store: DesktopStore };

const api = {
  platform: process.platform,
  getAppInfo: () => ipcRenderer.invoke('app:info') as Promise<AppInfo>,
  showMainWindow: () => ipcRenderer.send('app:renderer-ready'),
  getStateResult: () => ipcRenderer.invoke('store:get') as Promise<DesktopStoreGetResult>,
  getState: async () => {
    const result = (await ipcRenderer.invoke('store:get')) as DesktopStoreGetResult;
    if (result.ok) return result.store;
    throw new DesktopStoreLoadError(result.error);
  },
  onStoreUpdated: (callback: (store: DesktopStore) => void) => {
    const listener = (_event: IpcRendererEvent, store: DesktopStore) => callback(store);
    ipcRenderer.on('store:updated', listener);
    return () => ipcRenderer.removeListener('store:updated', listener);
  },
  saveUser: (user: Partial<UserProfile>) =>
    ipcRenderer.invoke('user:save', user) as Promise<DesktopStore>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings) as Promise<DesktopStore>,
  saveProvider: (provider: Partial<LlmProvider> & { removeApiKey?: boolean }) =>
    ipcRenderer.invoke('provider:save', provider) as Promise<DesktopStore>,
  deleteProvider: (id: string) =>
    ipcRenderer.invoke('provider:delete', id) as Promise<DesktopStore>,
  readProviderApiKey: (providerId: string) =>
    ipcRenderer.invoke('provider:read-api-key', providerId) as Promise<string>,
  testProvider: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:test', provider) as Promise<{ ok: boolean; message: string }>,
  listProviderModels: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:list-models', provider) as Promise<ProviderModel[]>,
  inferAnnotationMetadata: (payload: AnnotationMetadataPayload) =>
    ipcRenderer.invoke('annotation:metadata', payload) as Promise<AnnotationMetadata>,
  planFocusCoReadingRoute: (payload: FocusCoReadingRoutePayload) =>
    ipcRenderer.invoke('focus-co-reading:route', payload) as Promise<FocusCoReadingRouteResult>,
  getLogPath: () => ipcRenderer.invoke('log:path') as Promise<string>,
  readLog: () => ipcRenderer.invoke('log:read') as Promise<string>,
  clearLog: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  getDataManagementPaths: () => ipcRenderer.invoke('data:paths') as Promise<DataManagementPaths>,
  openDataManagementPath: (kind: DataManagementPathKind) =>
    ipcRenderer.invoke('data:open-path', kind) as Promise<void>,
  backupDatabase: () => ipcRenderer.invoke('data:database-backup') as Promise<DatabaseBackupResult>,
  restoreDatabase: () =>
    ipcRenderer.invoke('data:database-restore') as Promise<DatabaseRestoreResult>,
  recordPerformanceTiming: (input: PerformanceTimingInput) =>
    ipcRenderer.invoke('performance:timing', input) as Promise<void>,
  getUpdateStatus: () => ipcRenderer.invoke('updates:get-status') as Promise<AppUpdateState>,
  checkForUpdates: () => ipcRenderer.invoke('updates:check') as Promise<AppUpdateState>,
  downloadUpdate: () => ipcRenderer.invoke('updates:download') as Promise<AppUpdateState>,
  installUpdate: () => ipcRenderer.invoke('updates:install') as Promise<AppUpdateState>,
  onUpdateStatus: (callback: (state: AppUpdateState) => void) => {
    const listener = (_event: IpcRendererEvent, state: AppUpdateState) => callback(state);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  openUrl: (url: string) => ipcRenderer.invoke('url:open', url) as Promise<void>,
  getArticle: (id: string) =>
    ipcRenderer.invoke('article:get', id) as Promise<ArticleRecord | null>,
  getArticleCover: (id: string) => ipcRenderer.invoke('article:get-cover', id) as Promise<string>,
  saveArticle: (article: ArticleRecord) =>
    ipcRenderer.invoke('article:save', article) as Promise<DesktopStore>,
  saveArticleReadingProgress: (articleId: string, progress: ArticleReadingProgress) =>
    ipcRenderer.invoke('article:reading-progress', {
      articleId,
      progress,
    }) as Promise<ArticleReadingProgressPatch>,
  importArticleUrl: (url: string) =>
    ipcRenderer.invoke('article:import-url', url) as Promise<ArticleImportResult>,
  importEbookFile: (input: EbookImportFileInput) =>
    ipcRenderer.invoke('ebook:import-file', input) as Promise<ArticleImportResult>,
  readEbookFile: (articleId: string) =>
    ipcRenderer.invoke('ebook:read-file', articleId) as Promise<ArrayBuffer>,
  deleteArticle: (id: string) =>
    ipcRenderer.invoke('article:delete', id) as Promise<ArticleDeletePatch>,
  requestAgentComment: (payload: AgentMessagePayload) =>
    ipcRenderer.invoke('agent:comment', payload) as Promise<Comment>,
  requestAgentReview: (payload: AgentReviewPayload) =>
    ipcRenderer.invoke('agent:review', payload) as Promise<Comment[]>,
  requestAgentCommentStream: (
    payload: AgentMessagePayload,
    onEvent: (
      event: { type: 'start'; comment: Comment } | { type: 'delta'; delta: string },
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
          | { type: 'done'; comment: Comment }
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'delta') {
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
    ipcRenderer.invoke('agent:annotate', payload) as Promise<AgentAnnotateResult>,
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
  saveAgent: (agent: Partial<Agent>) =>
    ipcRenderer.invoke('agent:save', agent) as Promise<DesktopStore>,
  deleteAgent: (id: string) => ipcRenderer.invoke('agent:delete', id) as Promise<DesktopStore>,
};

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
