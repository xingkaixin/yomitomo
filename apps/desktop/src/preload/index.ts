import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  Agent,
  AppSettings,
  ArticleRecord,
  DesktopStore,
  LlmProvider,
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
  getLogPath: () => ipcRenderer.invoke('log:path') as Promise<string>,
  readLog: () => ipcRenderer.invoke('log:read') as Promise<string>,
  clearLog: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  openUrl: (url: string) => ipcRenderer.invoke('url:open', url) as Promise<void>,
  getPairingInfo: () => ipcRenderer.invoke('pairing:get') as Promise<PairingInfo>,
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
