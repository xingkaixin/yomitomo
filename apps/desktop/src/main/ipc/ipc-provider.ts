import type { DesktopStore } from '@yomitomo/shared';
import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { hasAppLockPin } from '../app-lock/app-lock-secrets';
import { DesktopIpcError } from '../../ipc-errors';
import { pruneLogFile } from '../app/logger';

export function registerProviderIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('user:save', async (_event, input) => {
    const { settingsPersistence } = await context.getPersistenceModule();
    return settingsPersistence.saveUser(input);
  });
  handleDesktopIpc('settings:save', async (_event, input) => {
    const { settingsPersistence } = await context.getPersistenceModule();
    await assertSettingsAppLockChangeAllowed(input, await settingsPersistence.readStore());
    const store = await settingsPersistence.saveSettings(input);
    await pruneLogFile(store.settings.logRetentionDays);
    context.sendFullStoreUpdated(store);
    return store;
  });
  handleDesktopIpc('provider:save', async (_event, input) => {
    const { providerPersistence } = await context.getPersistenceModule();
    const store = await providerPersistence.saveProvider(input);
    return store;
  });
  handleDesktopIpc('provider:delete', async (_event, id) => {
    const { providerPersistence } = await context.getPersistenceModule();
    const store = await providerPersistence.deleteProvider(id);
    return store;
  });
  handleDesktopIpc('provider:read-api-key', async (_event, providerId) => {
    if (!providerId) return '';
    const { providerPersistence } = await context.getPersistenceModule();
    return providerPersistence.readStoredProviderApiKey(providerId);
  });
  handleDesktopIpc('provider:test', async (_event, input) => {
    try {
      const { providerPersistence } = await context.getPersistenceModule();
      const { testProvider } = await context.getAiModule();
      const provider = await providerPersistence.hydrateProviderInputApiKey(input);
      const apiKey = provider.apiKey?.trim() || '';
      if (!apiKey) return { ok: false, message: 'PROVIDER_API_KEY_REQUIRED' };
      return testProvider({
        id: provider.id || 'provider_test',
        name: provider.name?.trim() || 'Temporary provider',
        type: provider.type || 'openai-chat',
        presetId: provider.presetId,
        logo: provider.logo,
        baseUrl: provider.baseUrl?.trim() || '',
        apiKey,
        hasApiKey: true,
        modelName: provider.modelName?.trim() || '',
        modelNames: provider.modelNames,
        modelInputMode: provider.modelInputMode,
        reasoningEffort: provider.reasoningEffort,
        createdAt: provider.createdAt || '',
        updatedAt: provider.updatedAt || '',
      });
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Provider test failed',
      };
    }
  });
  handleDesktopIpc('provider:list-models', async (_event, input) => {
    const { providerPersistence } = await context.getPersistenceModule();
    const { listProviderModels } = await context.getAiModule();
    return listProviderModels(await providerPersistence.hydrateProviderInputApiKey(input));
  });
}

async function assertSettingsAppLockChangeAllowed(
  input: { appLockEnabled?: boolean; appLockLocked?: boolean },
  store: DesktopStore,
) {
  if (
    Object.prototype.hasOwnProperty.call(input, 'appLockLocked') &&
    Boolean(input.appLockLocked) !== Boolean(store.settings.appLockLocked)
  ) {
    throw new DesktopIpcError('APP_LOCK_LOCKED_STATE_RESTRICTED');
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'appLockEnabled')) return;
  const nextEnabled = Boolean(input.appLockEnabled);
  const currentEnabled = Boolean(store.settings.appLockEnabled);
  if (nextEnabled && !(await hasAppLockPin())) throw new DesktopIpcError('APP_LOCK_PIN_REQUIRED');
  if (!nextEnabled && currentEnabled) throw new DesktopIpcError('APP_LOCK_PIN_REQUIRED');
}
