import { contextBridge, ipcRenderer } from 'electron';
import type { Agent, DesktopStore, LlmProvider, UserProfile } from '@yomitomo/shared';

const api = {
  getState: () => ipcRenderer.invoke('store:get') as Promise<DesktopStore>,
  saveUser: (user: Partial<UserProfile>) =>
    ipcRenderer.invoke('user:save', user) as Promise<DesktopStore>,
  saveProvider: (provider: Partial<LlmProvider>) =>
    ipcRenderer.invoke('provider:save', provider) as Promise<DesktopStore>,
  deleteProvider: (id: string) =>
    ipcRenderer.invoke('provider:delete', id) as Promise<DesktopStore>,
  testProvider: (id: string) =>
    ipcRenderer.invoke('provider:test', id) as Promise<{ ok: boolean; message: string }>,
  getLogPath: () => ipcRenderer.invoke('log:path') as Promise<string>,
  readLog: () => ipcRenderer.invoke('log:read') as Promise<string>,
  clearLog: () => ipcRenderer.invoke('log:clear') as Promise<void>,
  saveAgent: (agent: Partial<Agent>) =>
    ipcRenderer.invoke('agent:save', agent) as Promise<DesktopStore>,
  deleteAgent: (id: string) => ipcRenderer.invoke('agent:delete', id) as Promise<DesktopStore>,
};

contextBridge.exposeInMainWorld('yomitomoDesktop', api);

export type YomitomoDesktopApi = typeof api;
