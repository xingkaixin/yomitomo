import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AgentAnnotatePayload,
  AgentMessagePayload,
  AppSettings,
  ArticleRecord,
  Comment,
  DesktopStore,
  LlmProvider,
  ProviderModel,
  ReadingDeliberationRecord,
  ReadingCardRecord,
  ReadingCardReviewRecord,
  UserProfile,
} from '@yomitomo/shared';
import type { ReadingCardEvidenceUnit } from '@yomitomo/core';

export type GenerateReadingCardInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
  readingDeliberation?: ReadingDeliberationRecord;
};

export type GenerateReadingDeliberationInput = {
  article: ArticleRecord;
  articleText: string;
  evidenceUnits: ReadingCardEvidenceUnit[];
};

export type ReviewReadingCardInput = GenerateReadingCardInput & {
  readingCard: ReadingCardRecord;
  reviewAgentIds?: string[];
};

export type PairingInfo = {
  token: string;
  pairingId: string;
  updatedAt: string;
};

export type PairingConnectionStatus = {
  authenticatedSocketCount: number;
};

const api = {
  getState: () => ipcRenderer.invoke('store:get') as Promise<DesktopStore>,
  onStoreUpdated: (callback: (store: DesktopStore) => void) => {
    const listener = (_event: IpcRendererEvent, store: DesktopStore) => callback(store);
    ipcRenderer.on('store:updated', listener);
    return () => ipcRenderer.removeListener('store:updated', listener);
  },
  saveUser: (user: Partial<UserProfile>) =>
    ipcRenderer.invoke('user:save', user) as Promise<DesktopStore>,
  saveSettings: (settings: AppSettings) =>
    ipcRenderer.invoke('settings:save', settings) as Promise<DesktopStore>,
  saveProvider: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:save', provider) as Promise<DesktopStore>,
  deleteProvider: (id: string) =>
    ipcRenderer.invoke('provider:delete', id) as Promise<DesktopStore>,
  testProvider: (id: string) =>
    ipcRenderer.invoke('provider:test', id) as Promise<{ ok: boolean; message: string }>,
  listProviderModels: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:list-models', provider) as Promise<ProviderModel[]>,
  getLogPath: () => ipcRenderer.invoke('log:path') as Promise<string>,
  readLog: () => ipcRenderer.invoke('log:read') as Promise<string>,
  clearLog: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  openUrl: (url: string) => ipcRenderer.invoke('url:open', url) as Promise<void>,
  saveArticle: (article: ArticleRecord) =>
    ipcRenderer.invoke('article:save', article) as Promise<DesktopStore>,
  deleteArticle: (id: string) => ipcRenderer.invoke('article:delete', id) as Promise<DesktopStore>,
  requestAgentComment: (payload: AgentMessagePayload) =>
    ipcRenderer.invoke('agent:comment', payload) as Promise<Comment>,
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
    ipcRenderer.invoke('agent:annotate', payload) as Promise<{
      annotations: ArticleRecord['annotations'];
    }>,
  requestAgentAnnotationsStream: (
    payload: AgentAnnotatePayload,
    onEvent: (
      event: { type: 'start' } | { type: 'item'; annotation: ArticleRecord['annotations'][number] },
    ) => void,
  ) => {
    const requestId = makeRequestId();
    const channel = `agent:annotate:stream:${requestId}`;
    return new Promise<ArticleRecord['annotations']>((resolve, reject) => {
      const listener = (
        _event: IpcRendererEvent,
        message:
          | { type: 'start' }
          | { type: 'item'; annotation: ArticleRecord['annotations'][number] }
          | { type: 'done'; annotations: ArticleRecord['annotations'] }
          | { type: 'error'; message: string },
      ) => {
        if (message.type === 'start' || message.type === 'item') {
          onEvent(message);
          return;
        }
        ipcRenderer.removeListener(channel, listener);
        if (message.type === 'done') resolve(message.annotations);
        else reject(new Error(message.message));
      };
      ipcRenderer.on(channel, listener);
      ipcRenderer.send('agent:annotate:stream', { requestId, payload });
    });
  },
  getPairingInfo: () => ipcRenderer.invoke('pairing:get') as Promise<PairingInfo>,
  getSavedPairingInfo: () => ipcRenderer.invoke('pairing:saved') as Promise<PairingInfo | null>,
  rotatePairingInfo: () => ipcRenderer.invoke('pairing:rotate') as Promise<PairingInfo>,
  getPairingConnectionStatus: () =>
    ipcRenderer.invoke('pairing:connection-status') as Promise<PairingConnectionStatus>,
  onPairingConnectionStatus: (callback: (status: PairingConnectionStatus) => void) => {
    const listener = (_event: IpcRendererEvent, status: PairingConnectionStatus) =>
      callback(status);
    ipcRenderer.on('pairing:connection-status', listener);
    return () => ipcRenderer.removeListener('pairing:connection-status', listener);
  },
  generateReadingCard: (input: GenerateReadingCardInput) =>
    ipcRenderer.invoke('reading-card:generate', input) as Promise<{
      readingCard: ReadingCardRecord;
    }>,
  generateReadingDeliberation: (input: GenerateReadingDeliberationInput) =>
    ipcRenderer.invoke('reading-deliberation:generate', input) as Promise<{
      readingDeliberation: ReadingDeliberationRecord;
    }>,
  reviewReadingCard: (input: ReviewReadingCardInput) =>
    ipcRenderer.invoke('reading-card:review', input) as Promise<{
      review: ReadingCardReviewRecord;
    }>,
  saveAgent: (agent: Partial<Agent>) =>
    ipcRenderer.invoke('agent:save', agent) as Promise<DesktopStore>,
  deleteAgent: (id: string) => ipcRenderer.invoke('agent:delete', id) as Promise<DesktopStore>,
};

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;

function makeRequestId() {
  return `request_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
