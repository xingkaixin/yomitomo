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
import { desktopIpcInvokeDescriptors } from '../../ipc-contract';
import { desktopIpcInvokeChannelsWithFlag } from '../../ipc/desktop-ipc-descriptor';
import { DesktopIpcError, desktopIpcErrorCodes, serializeDesktopIpcError } from '../../ipc-errors';
import { validateDesktopIpcInvokeArgs } from '../../ipc-schemas';
import { withDatabaseLease } from '../store/store-db';
import { assertDesktopIpcInvokeSenderAuthorized } from './ipc-sender-guard';
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
    storeSettings: Pick<typeof import('../store/store-settings'), 'readAppLockSettings'>;
  }>;
};

export type DesktopIpcHandler<Channel extends DesktopIpcInvokeChannel> = (
  event: IpcMainInvokeEvent,
  ...args: DesktopIpcInvokeArgs<Channel>
) => DesktopIpcInvokeResult<Channel> | Promise<DesktopIpcInvokeResult<Channel>>;

const appLockGuardBypassChannels = desktopIpcInvokeChannelsWithFlag(
  desktopIpcInvokeDescriptors,
  'appLockBypass',
);

const databaseLifecycleChannels = desktopIpcInvokeChannelsWithFlag(
  desktopIpcInvokeDescriptors,
  'databaseLifecycle',
);

const registeredDesktopIpcChannels = new Set<DesktopIpcInvokeChannel>();
const desktopIpcInvokeChannels = Object.keys(
  desktopIpcInvokeDescriptors,
) as DesktopIpcInvokeChannel[];

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
      assertDesktopIpcInvokeSenderAuthorized(channel, event);
      await assertDesktopIpcChannelAllowedByAppLock(channel);
      const invoke = async () => handler(event, ...validateDesktopIpcInvokeArgs(channel, args));
      const value = databaseLifecycleChannels.has(channel)
        ? await invoke()
        : await withDatabaseLease(invoke);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: serializeDesktopIpcError(error) };
    }
  });
  registeredDesktopIpcChannels.add(channel);
}

export function assertDesktopIpcRegistrationComplete() {
  const missingChannels = desktopIpcInvokeChannels
    .filter((channel) => !registeredDesktopIpcChannels.has(channel))
    .toSorted();
  if (missingChannels.length === 0) return;
  throw new Error(`Missing desktop IPC handlers: ${missingChannels.join(', ')}`);
}

export function resetDesktopIpcRegistrationsForTest() {
  registeredDesktopIpcChannels.clear();
}

export async function assertDesktopIpcAppLockUnlocked(context: DesktopIpcAppLockGuardContext) {
  const { storeSettings } = await context.getPersistenceModules();
  assertAppLockSettingsUnlocked(storeSettings.readAppLockSettings());
}

export function assertAppLockSettingsUnlocked(
  settings: Pick<DesktopStore['settings'], 'appLockEnabled' | 'appLockLocked'>,
) {
  if (!isAppLockSettingsLocked(settings)) return;
  throw new DesktopIpcError(desktopIpcErrorCodes.appLockRequired);
}

async function assertDesktopIpcChannelAllowedByAppLock(channel: DesktopIpcInvokeChannel) {
  if (!appLockGuardContext || appLockGuardBypassChannels.has(channel)) return;
  await assertDesktopIpcAppLockUnlocked(appLockGuardContext);
}
