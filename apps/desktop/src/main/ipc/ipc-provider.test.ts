import { describe, expect, it, vi } from 'vitest';
import type { AppSettingsPatch, DesktopStore } from '@yomitomo/shared';
import { emptyDesktopStore } from '../../app-store';
import { registerProviderIpc } from './ipc-provider';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
  pruneLogFile: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

vi.mock('../app/logger', () => ({
  pruneLogFile: ipcMocks.pruneLogFile,
}));

describe('provider IPC persistence boundary', () => {
  it('forwards saved settings with their source event', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const store = desktopStore();
    const saveSettings = vi.fn(async (_input: AppSettingsPatch) => store);
    const readAppLockSettings = vi.fn(() => ({
      appLockEnabled: false,
      appLockLocked: false,
    }));
    const sendFullStoreUpdated = vi.fn();
    registerProviderIpc(
      providerIpcContext({}, {}, { readAppLockSettings, saveSettings }, { sendFullStoreUpdated }),
    );
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'settings:save',
    )?.[1];
    const event = { sender: { id: 17 } };

    const result = await handler(event, { uiLanguage: 'en' });

    expect(result).toEqual({ ok: true, value: store });
    expect(readAppLockSettings).toHaveBeenCalledOnce();
    expect(sendFullStoreUpdated).toHaveBeenCalledWith(event, store);
  });

  it('rejects renderer-controlled app lock state changes through settings', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const saveSettings = vi.fn();
    const readAppLockSettings = vi.fn(() => ({
      appLockEnabled: true,
      appLockLocked: true,
    }));
    registerProviderIpc(providerIpcContext({}, {}, { readAppLockSettings, saveSettings }));
    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'settings:save',
    )?.[1];

    const result = await handler({}, { appLockLocked: false });

    expect(result).toMatchObject({
      error: { code: 'APP_LOCK_LOCKED_STATE_RESTRICTED' },
      ok: false,
    });
    expect(readAppLockSettings).toHaveBeenCalledOnce();
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('reads provider API keys through provider persistence only', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const readStoredProviderApiKey = vi.fn(async () => 'provider-secret');

    registerProviderIpc(providerIpcContext({ readStoredProviderApiKey }));

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'provider:read-api-key',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, 'provider_1');

    expect(result).toEqual({ ok: true, value: 'provider-secret' });
    expect(readStoredProviderApiKey).toHaveBeenCalledWith('provider_1');
  });

  it('does not return raw provider test errors to the renderer', async () => {
    ipcMocks.ipcMainHandle.mockClear();
    const hydrateProviderInputApiKey = vi.fn(async () => ({
      id: 'provider_1',
      name: 'Provider',
      type: 'openai-chat' as const,
      baseUrl: 'https://api.example.com',
      apiKey: 'sk-secret',
      modelName: 'model',
    }));
    const testProvider = vi.fn(async () => {
      throw new Error('Authorization: Bearer sk-secret');
    });

    registerProviderIpc(providerIpcContext({ hydrateProviderInputApiKey }, { testProvider }));

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'provider:test',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, { id: 'provider_1' });

    expect(result).toEqual({
      ok: true,
      value: { ok: false, message: 'PROVIDER_TEST_FAILED' },
    });
    expect(JSON.stringify(result)).not.toContain('sk-secret');
  });
});

type ProviderIpcContext = Parameters<typeof registerProviderIpc>[0];
type ProviderRepository = Awaited<
  ReturnType<ProviderIpcContext['getPersistenceModules']>
>['providerRepository'];
type ProviderAiModule = Awaited<ReturnType<ProviderIpcContext['getAiModule']>>;
type ProviderPersistenceModules = Awaited<ReturnType<ProviderIpcContext['getPersistenceModules']>>;

function providerIpcContext(
  providerOverrides: Partial<ProviderRepository>,
  aiOverrides: Partial<ProviderAiModule> = {},
  persistenceOverrides: {
    readAppLockSettings?: ProviderPersistenceModules['storeSettings']['readAppLockSettings'];
    saveSettings?: ProviderPersistenceModules['storeSettings']['saveSettings'];
  } = {},
  contextOverrides: Partial<ProviderIpcContext> = {},
): ProviderIpcContext {
  return {
    getAiModule: async () => ({
      listProviderModels: vi.fn(),
      testProvider: vi.fn(),
      ...aiOverrides,
    }),
    getPersistenceModules: async () => ({
      providerRepository: {
        hydrateProviderInputApiKey: vi.fn(),
        readStoredProviderApiKey: vi.fn(),
        ...providerOverrides,
      },
      storeProviders: {
        deleteProvider: vi.fn(),
        saveProvider: vi.fn(),
      },
      storeSettings: {
        readAppLockSettings:
          persistenceOverrides.readAppLockSettings ||
          vi.fn<ProviderPersistenceModules['storeSettings']['readAppLockSettings']>(() => ({
            appLockEnabled: false,
            appLockLocked: false,
          })),
        saveSettings:
          persistenceOverrides.saveSettings ||
          vi.fn<ProviderPersistenceModules['storeSettings']['saveSettings']>(),
        saveSettingsShell: vi.fn(),
        saveUser: vi.fn(),
      },
    }),
    sendFullStoreUpdated: vi.fn(),
    ...contextOverrides,
  };
}

function desktopStore(): DesktopStore {
  return {
    ...emptyDesktopStore,
    user: {
      id: 'user_1',
      nickname: 'User',
      username: 'user',
      avatar: '',
      annotationColor: '#000000',
      updatedAt: '2026-07-18T00:00:00.000Z',
    },
  };
}
