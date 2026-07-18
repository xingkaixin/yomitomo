import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type {
  ArticleStorePatch,
  CollectionStorePatch,
  DesktopStore,
  LibraryPinPatch,
} from '@yomitomo/shared';
import { isAppLockSettingsLocked } from '../../app-store';
import type { DesktopStoreLoadErrorInfo } from '../../app-store-errors';
import type {
  DesktopIpcInvokeArgs,
  DesktopIpcInvokeChannel,
  DesktopIpcInvokeResult,
} from '../../ipc-contract';
import { DesktopIpcError, desktopIpcErrorCodes, serializeDesktopIpcError } from '../../ipc-errors';
import { validateDesktopIpcInvokeArgs } from '../../ipc-schemas';
import type { RendererStateEventDispatcher } from './renderer-state-event-dispatcher';

export { isAppLockSettingsLocked } from '../../app-store';

export type DesktopPersistenceModules = {
  providerRepository: typeof import('../providers/provider-repository');
  storeAgents: typeof import('../store/store-agents');
  storeArticles: typeof import('../store/store-articles');
  storeAssistantExecutions: typeof import('../store/store-assistant-executions');
  storeCollections: typeof import('../store/store-collections');
  storeModelPricing: typeof import('../store/store-model-pricing');
  storeProviders: typeof import('../store/store-providers');
  storeSettings: typeof import('../store/store-settings');
  storeSnapshot: typeof import('../store/store-snapshot');
  weReadRepository: typeof import('../weread/weread-repository');
};

export interface DesktopMainIpcContext {
  getMainWindow: () => BrowserWindow | null;
  getPersistenceModules: () => Promise<DesktopPersistenceModules>;
  getAiModule: () => Promise<typeof import('@yomitomo/ai')>;
  getAppUpdaterModule: () => Promise<typeof import('../app/app-updater')>;
  getAppVersion: () => string;
  sendFullStoreUpdated: (event: IpcMainInvokeEvent, store: DesktopStore) => void;
  sendArticlePatched: (event: IpcMainInvokeEvent, patch: ArticleStorePatch) => void;
  sendCollectionPatched: (event: IpcMainInvokeEvent, patch: CollectionStorePatch) => void;
  sendLibraryPinPatched: (event: IpcMainInvokeEvent, patch: LibraryPinPatch) => void;
  registerRendererStateEventTarget: RendererStateEventDispatcher['registerTarget'];
  recordStartupTiming: (event: string, data?: Record<string, unknown>) => void;
  recordPerformanceTiming: (input: unknown) => void;
  configureWeReadAutoSync: (reason: string) => void;
  storeLoadErrorInfo: (error: unknown) => Promise<DesktopStoreLoadErrorInfo>;
  elapsedMs: (startedAt: number) => number;
  logInfo: typeof import('../app/logger').logInfo;
  logError: typeof import('../app/logger').logError;
  openExternalUrl: (value: string) => Promise<void>;
}

export type DesktopAiModule = Awaited<ReturnType<DesktopMainIpcContext['getAiModule']>>;
export type DesktopAppUpdaterModule = Awaited<
  ReturnType<DesktopMainIpcContext['getAppUpdaterModule']>
>;

export type DesktopIpcAppLockGuardContext = {
  getPersistenceModules: () => Promise<{
    storeSnapshot: Pick<typeof import('../store/store-snapshot'), 'readStore'>;
  }>;
};

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

let appLockGuardContext: DesktopIpcAppLockGuardContext | null = null;

export function configureDesktopIpcAppLockGuardContext(
  context: DesktopIpcAppLockGuardContext | null,
) {
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

export async function assertDesktopIpcAppLockUnlocked(context: DesktopIpcAppLockGuardContext) {
  const { storeSnapshot } = await context.getPersistenceModules();
  const store = await storeSnapshot.readStore();
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
