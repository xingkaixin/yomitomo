import type { DesktopStoreGetResult } from '../../app-store-errors';
import { DesktopIpcError } from '../../ipc-errors';
import type { StartupStoreInitializationResult } from '../app/startup-store';
import type { DesktopAppUpdaterModule, DesktopMainIpcContext } from './ipc';
import { assertAppLockSettingsUnlocked, handleDesktopIpc } from './ipc';
import {
  clearAgentRuntimeTraces,
  getAgentRuntimeTracePath,
  readAgentRuntimeTraces,
} from '../agents/agent-runtime-trace-log';
import { clearLogFile, getLogPath, readLogFile } from '../app/logger';

type StoreDataIpcContext = Pick<
  DesktopMainIpcContext,
  'getMainWindow' | 'logError' | 'sendFullStoreUpdated' | 'storeLoadErrorInfo'
> & {
  startupStoreInitialization: StartupStoreInitializationResult;
  getAppUpdaterModule: () => Promise<
    Pick<
      DesktopAppUpdaterModule,
      | 'checkForAppUpdates'
      | 'downloadAppUpdate'
      | 'getAppUpdateState'
      | 'installAppUpdate'
      | 'simulateUpdateAvailable'
    >
  >;
  getPersistenceModules: () => Promise<{
    storeAssistantExecutions: Pick<
      typeof import('../store/store-assistant-executions'),
      | 'queryAssistantExecutionRunDetail'
      | 'queryAssistantExecutionRuns'
      | 'queryAssistantExecutionSummary'
    >;
    storeSnapshot: Pick<typeof import('../store/store-snapshot'), 'readShellStore'>;
  }>;
};

export function registerStoreDataIpc(context: StoreDataIpcContext) {
  handleDesktopIpc('store:get', async (): Promise<DesktopStoreGetResult> => {
    try {
      if (!context.startupStoreInitialization.ok) {
        throw context.startupStoreInitialization.error;
      }
      const { storeSnapshot } = await context.getPersistenceModules();
      const store = await storeSnapshot.readShellStore();
      assertAppLockSettingsUnlocked(store.settings);
      return { ok: true, store };
    } catch (error) {
      if (error instanceof DesktopIpcError) throw error;
      context.logError('store.get_failed', error);
      return { ok: false, error: await context.storeLoadErrorInfo(error) };
    }
  });
  handleDesktopIpc('data:paths', async () => {
    const { getDataManagementPaths } = await import('../data-management');
    return getDataManagementPaths();
  });
  handleDesktopIpc('data:open-path', async (_event, kind) => {
    const { openDataManagementPath } = await import('../data-management');
    return openDataManagementPath(kind);
  });
  handleDesktopIpc('data:database-backup', async () => {
    const { backupDatabaseWithDialog } = await import('../data-management');
    return backupDatabaseWithDialog(context.getMainWindow());
  });
  handleDesktopIpc('data:database-restore', async (event) => {
    const { restoreDatabaseWithDialog } = await import('../data-management');
    const result = await restoreDatabaseWithDialog(context.getMainWindow());
    if (!result.canceled) context.sendFullStoreUpdated(event, result.store);
    return result;
  });
  handleDesktopIpc('log:path', () => getLogPath());
  handleDesktopIpc('log:read', () => readLogFile());
  handleDesktopIpc('log:clear', () => clearLogFile());
  handleDesktopIpc('agent-trace:path', () => getAgentRuntimeTracePath());
  handleDesktopIpc('agent-trace:list', (_event, input) => readAgentRuntimeTraces(input));
  handleDesktopIpc('agent-trace:clear', () => clearAgentRuntimeTraces());
  handleDesktopIpc('assistant-executions:list', async (_event, input) => {
    const { storeAssistantExecutions } = await context.getPersistenceModules();
    return storeAssistantExecutions.queryAssistantExecutionRuns(input);
  });
  handleDesktopIpc('assistant-executions:detail', async (_event, id) => {
    const { storeAssistantExecutions } = await context.getPersistenceModules();
    return storeAssistantExecutions.queryAssistantExecutionRunDetail(id);
  });
  handleDesktopIpc('assistant-executions:summary', async (_event, input) => {
    const { storeAssistantExecutions } = await context.getPersistenceModules();
    return storeAssistantExecutions.queryAssistantExecutionSummary(input);
  });
  handleDesktopIpc('updates:get-status', async () => {
    const { getAppUpdateState } = await context.getAppUpdaterModule();
    return getAppUpdateState();
  });
  handleDesktopIpc('updates:check', async () => {
    const { checkForAppUpdates } = await context.getAppUpdaterModule();
    return checkForAppUpdates();
  });
  handleDesktopIpc('updates:download', async () => {
    const { downloadAppUpdate } = await context.getAppUpdaterModule();
    return downloadAppUpdate();
  });
  handleDesktopIpc('updates:install', async () => {
    const { installAppUpdate } = await context.getAppUpdaterModule();
    return installAppUpdate();
  });
  handleDesktopIpc('updates:simulate-available', async (_event, trigger) => {
    const { simulateUpdateAvailable } = await context.getAppUpdaterModule();
    return simulateUpdateAvailable(trigger);
  });
  handleDesktopIpc('release-notes:get', async (_event, input) => {
    const { getReleaseNote } = await import('../app/release-notes');
    return getReleaseNote(input.version, input.source, input.language);
  });
}
