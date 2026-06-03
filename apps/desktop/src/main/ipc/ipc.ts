import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { DesktopStore } from '@yomitomo/shared';
import type { DesktopStoreLoadErrorInfo } from '../../app-store-errors';
import type {
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
} from '../../ipc-contract';

export interface DesktopMainIpcContext {
  getMainWindow: () => BrowserWindow | null;
  getStoreModule: () => Promise<typeof import('../store')>;
  getAiModule: () => Promise<typeof import('@yomitomo/ai')>;
  getAppUpdaterModule: () => Promise<typeof import('../app/app-updater')>;
  getAppVersion: () => string;
  sendFullStoreUpdated: (store: DesktopStore) => void;
  recordStartupTiming: (event: string, data?: Record<string, unknown>) => void;
  recordPerformanceTiming: (input: unknown) => void;
  scheduleLogPrune: (retentionDays: number | undefined) => void;
  storeLoadErrorInfo: (error: unknown) => Promise<DesktopStoreLoadErrorInfo>;
  elapsedMs: (startedAt: number) => number;
  logInfo: typeof import('../app/logger').logInfo;
  logError: typeof import('../app/logger').logError;
  openExternalUrl: (value: string) => Promise<void>;
}

export type DesktopIpcHandler<Channel extends DesktopIpcInvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: DesktopIpcInvokeArgs<Channel>
) => DesktopIpcInvokeResult<Channel> | Promise<DesktopIpcInvokeResult<Channel>>;

export function handleDesktopIpc<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  handler: DesktopIpcHandler<Channel>,
) {
  ipcMain.handle(channel, handler);
}
