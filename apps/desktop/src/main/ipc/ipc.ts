import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import type { DesktopStoreLoadErrorInfo } from '../../app-store-errors';
import type {
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
} from '../../ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes, serializeDesktopIpcError } from '../../ipc-errors';
import { validateDesktopIpcInvokeArgs } from '../../ipc-schemas';
import { isAppLockSettingsLocked } from './app-lock-renderer-store';

export { isAppLockSettingsLocked } from './app-lock-renderer-store';

export interface DesktopMainIpcContext {
  getMainWindow: () => BrowserWindow | null;
  getPersistenceModule: () => Promise<typeof import('../store/desktop-persistence')>;
  getAiModule: () => Promise<typeof import('@yomitomo/ai')>;
  getAppUpdaterModule: () => Promise<typeof import('../app/app-updater')>;
  getAppVersion: () => string;
  sendFullStoreUpdated: (store: DesktopStore) => void;
  sendArticlePatched: (patch: ArticleStorePatch) => void;
  sendCollectionPatched: (patch: CollectionStorePatch) => void;
  sendLibraryPinPatched: (patch: LibraryPinPatch) => void;
  setSensitiveRendererEventsLocked: (locked: boolean) => void;
  recordStartupTiming: (event: string, data?: Record<string, unknown>) => void;
  recordPerformanceTiming: (input: unknown) => void;
  scheduleLogPrune: (retentionDays: number | undefined) => void;
  configureWeReadAutoSync: (reason: string) => void;
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

const appLockGuardBypassChannels = new Set<DesktopIpcInvokeChannel>([
  'app:info',
  'appLock:getStatus',
  'appLock:unlock',
  'performance:timing',
  'store:get',
]);

let appLockGuardContext: DesktopMainIpcContext | null = null;

export function configureDesktopIpcAppLockGuardContext(context: DesktopMainIpcContext | null) {
  appLockGuardContext = context;
}

export function handleDesktopIpc<Channel extends DesktopIpcInvokeChannel>(
  channel: Channel,
  handler: DesktopIpcHandler<Channel>,
) {
  ipcMain.handle(channel, async (event, ...args: DesktopIpcInvokeArgs<Channel>) => {
    try {
      await assertDesktopIpcChannelAllowedByAppLock(channel);
      const value = await handler(event, ...validateDesktopIpcInvokeArgs(channel, args));
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: serializeDesktopIpcError(error) };
    }
  });
}

export async function assertDesktopIpcAppLockUnlocked(context: DesktopMainIpcContext) {
  const { storeSnapshotPersistence } = await context.getPersistenceModule();
  const store = await storeSnapshotPersistence.readStore();
  assertAppLockSettingsUnlocked(store.settings);
}

export function assertAppLockSettingsUnlocked(settings: DesktopStore['settings']) {
  if (!isAppLockSettingsLocked(settings)) return;
  throw new DesktopIpcError(desktopIpcErrorCodes.appLockRequired);
}

async function assertDesktopIpcChannelAllowedByAppLock(channel: DesktopIpcInvokeChannel) {
  if (!appLockGuardContext || appLockGuardBypassChannels.has(channel)) return;
  await assertDesktopIpcAppLockUnlocked(appLockGuardContext);
}
