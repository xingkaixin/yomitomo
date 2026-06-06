import type { DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { pruneLogFile } from '../app/logger';

export function registerProviderIpc(context: DesktopMainIpcContext) {
  handleDesktopIpc('user:save', async (_event, input) => {
    const { saveUser } = await context.getStoreModule();
    return saveUser(input);
  });
  handleDesktopIpc('settings:save', async (_event, input) => {
    const { saveSettings } = await context.getStoreModule();
    const store = await saveSettings(input);
    await pruneLogFile(store.settings.logRetentionDays);
    context.sendFullStoreUpdated(store);
    return store;
  });
  handleDesktopIpc('provider:save', async (_event, input) => {
    const { saveProvider } = await context.getStoreModule();
    const store = await saveProvider(input);
    return store;
  });
  handleDesktopIpc('provider:delete', async (_event, id) => {
    const { deleteProvider } = await context.getStoreModule();
    const store = await deleteProvider(id);
    return store;
  });
  handleDesktopIpc('provider:read-api-key', async (_event, providerId) => {
    if (!providerId) return '';
    const { readStoredProviderApiKey } = await context.getStoreModule();
    return readStoredProviderApiKey(providerId);
  });
  handleDesktopIpc('provider:test', async (_event, input) => {
    try {
      const { hydrateProviderInputApiKey } = await context.getStoreModule();
      const { testProvider } = await context.getAiModule();
      const provider = await hydrateProviderInputApiKey(input);
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
    const { hydrateProviderInputApiKey } = await context.getStoreModule();
    const { listProviderModels } = await context.getAiModule();
    return listProviderModels(await hydrateProviderInputApiKey(input));
  });
}
