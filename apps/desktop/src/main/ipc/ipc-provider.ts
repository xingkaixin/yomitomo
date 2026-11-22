import { isChatGptOAuthProvider, type ResolvedAppSettings } from '@yomitomo/shared';
import type { DesktopAiModule, DesktopMainIpcContext } from './ipc';
import { handleDesktopIpc } from './ipc';
import { hasAppLockPin } from '../app-lock/app-lock-secrets';
import { DesktopIpcError, desktopIpcErrorCodes } from '../../ipc-errors';
import { pruneLogFile } from '../app/logger';
import {
  ChatGptAuthRequiredError,
  ChatGptReauthRequiredError,
} from '../providers/chatgpt-oauth-repository';

type ProviderIpcContext = Pick<
  DesktopMainIpcContext,
  'openExternalUrl' | 'sendFullStoreUpdated'
> & {
  onSettingsSaved?: () => void;
  getAiModule: () => Promise<
    Pick<DesktopAiModule, 'listProviderModels' | 'providerThinkingCapabilities' | 'testProvider'>
  >;
  getPersistenceModules: () => Promise<{
    chatGptOAuthRepository: Pick<
      typeof import('../providers/chatgpt-oauth-repository'),
      | 'cancelChatGptSignIn'
      | 'disconnectChatGptAccount'
      | 'readChatGptAccountState'
      | 'signInChatGptAccount'
    >;
    providerRepository: Pick<
      typeof import('../providers/provider-repository'),
      'hydrateProviderInputApiKey' | 'readStoredProviderApiKey'
    >;
    storeProviders: Pick<
      typeof import('../store/store-providers'),
      'deleteProvider' | 'saveProvider'
    >;
    storeSettings: Pick<
      typeof import('../store/store-settings'),
      'readAppLockSettings' | 'saveSettings' | 'saveUser'
    >;
  }>;
};

export function registerProviderIpc(context: ProviderIpcContext) {
  handleDesktopIpc('user:save', async (_event, input) => {
    const { storeSettings } = await context.getPersistenceModules();
    return storeSettings.saveUser(input);
  });
  handleDesktopIpc('settings:save', async (event, input) => {
    const { storeSettings } = await context.getPersistenceModules();
    await assertSettingsAppLockChangeAllowed(input, storeSettings.readAppLockSettings());
    const settingsInput = { ...input };
    // Only the dedicated privacy action can change consent, not stale settings snapshots.
    delete settingsInput.readingMemoryRemoteConsent;
    // Settings commit synchronously; the returned promise waits for the full snapshot.
    const storePromise = storeSettings.saveSettings(settingsInput);
    context.onSettingsSaved?.();
    const store = await storePromise;
    // Startup prunes the log; a settings save only needs to when the retention changes.
    if (settingsInput.logRetentionDays !== undefined) {
      await pruneLogFile(store.settings.logRetentionDays);
    }
    context.sendFullStoreUpdated(event, store);
    return store;
  });
  handleDesktopIpc('provider:chatgpt-auth-status', async () => {
    const { chatGptOAuthRepository } = await context.getPersistenceModules();
    return chatGptOAuthRepository.readChatGptAccountState();
  });
  handleDesktopIpc('provider:chatgpt-sign-in', async () => {
    const { chatGptOAuthRepository } = await context.getPersistenceModules();
    return chatGptOAuthRepository.signInChatGptAccount({
      openBrowser: context.openExternalUrl,
    });
  });
  handleDesktopIpc('provider:chatgpt-cancel-sign-in', async () => {
    const { chatGptOAuthRepository } = await context.getPersistenceModules();
    chatGptOAuthRepository.cancelChatGptSignIn();
  });
  handleDesktopIpc('provider:chatgpt-disconnect', async () => {
    const { chatGptOAuthRepository } = await context.getPersistenceModules();
    return chatGptOAuthRepository.disconnectChatGptAccount();
  });
  handleDesktopIpc('provider:save', async (_event, input) => {
    const { storeProviders } = await context.getPersistenceModules();
    return storeProviders.saveProvider(input);
  });
  handleDesktopIpc('provider:delete', async (_event, id) => {
    const { storeProviders } = await context.getPersistenceModules();
    return storeProviders.deleteProvider(id);
  });
  handleDesktopIpc('provider:read-api-key', async (_event, providerId) => {
    if (!providerId) return '';
    const { providerRepository } = await context.getPersistenceModules();
    return providerRepository.readStoredProviderApiKey(providerId);
  });
  handleDesktopIpc('provider:test', async (_event, input) => {
    try {
      const { providerRepository } = await context.getPersistenceModules();
      const { testProvider } = await context.getAiModule();
      const provider = await providerRepository.hydrateProviderInputApiKey(input);
      const apiKey = provider.apiKey?.trim() || '';
      if (!apiKey) {
        return {
          ok: false,
          message: isChatGptOAuthProvider(provider)
            ? desktopIpcErrorCodes.chatGptAuthRequired
            : 'PROVIDER_API_KEY_REQUIRED',
        };
      }
      return await testProvider({
        id: provider.id || 'provider_test',
        name: provider.name?.trim() || 'Temporary provider',
        type: provider.type || 'openai-chat',
        presetId: provider.presetId,
        logo: provider.logo,
        baseUrl: provider.baseUrl?.trim() || '',
        apiKey,
        hasApiKey: !isChatGptOAuthProvider(provider),
        modelName: provider.modelName?.trim() || '',
        modelNames: provider.modelNames,
        modelInputMode: provider.modelInputMode,
        reasoningEffort: provider.reasoningEffort,
        createdAt: provider.createdAt || '',
        updatedAt: provider.updatedAt || '',
      });
    } catch (error) {
      if (error instanceof ChatGptAuthRequiredError) {
        return { ok: false, message: desktopIpcErrorCodes.chatGptAuthRequired };
      }
      if (error instanceof ChatGptReauthRequiredError) {
        return { ok: false, message: desktopIpcErrorCodes.chatGptReauthRequired };
      }
      return {
        ok: false,
        message: 'PROVIDER_TEST_FAILED',
      };
    }
  });
  handleDesktopIpc('provider:list-models', async (_event, input) => {
    const { providerRepository } = await context.getPersistenceModules();
    const { listProviderModels } = await context.getAiModule();
    try {
      return await listProviderModels(await providerRepository.hydrateProviderInputApiKey(input));
    } catch (error) {
      if (error instanceof ChatGptAuthRequiredError) {
        throw new DesktopIpcError(desktopIpcErrorCodes.chatGptAuthRequired, undefined, {
          cause: error,
        });
      }
      if (error instanceof ChatGptReauthRequiredError) {
        throw new DesktopIpcError(desktopIpcErrorCodes.chatGptReauthRequired, undefined, {
          cause: error,
        });
      }
      throw error;
    }
  });
  handleDesktopIpc('provider:thinking-levels', async (_event, input) => {
    const { providerThinkingCapabilities } = await context.getAiModule();
    return providerThinkingCapabilities(input);
  });
}

async function assertSettingsAppLockChangeAllowed(
  input: { appLockEnabled?: boolean; appLockLocked?: boolean },
  settings: Pick<ResolvedAppSettings, 'appLockEnabled' | 'appLockLocked'>,
) {
  if (
    Object.prototype.hasOwnProperty.call(input, 'appLockLocked') &&
    Boolean(input.appLockLocked) !== settings.appLockLocked
  ) {
    throw new DesktopIpcError(desktopIpcErrorCodes.appLockLockedStateRestricted);
  }
  if (!Object.prototype.hasOwnProperty.call(input, 'appLockEnabled')) return;
  const nextEnabled = Boolean(input.appLockEnabled);
  const currentEnabled = settings.appLockEnabled;
  if (nextEnabled && !(await hasAppLockPin())) {
    throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinRequired);
  }
  if (!nextEnabled && currentEnabled) {
    throw new DesktopIpcError(desktopIpcErrorCodes.appLockPinRequired);
  }
}
