import { contextBridge, ipcRenderer } from 'electron';
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
  updatedAt: string;
};

const api = {
  getState: () => ipcRenderer.invoke('store:get') as Promise<DesktopStore>,
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
