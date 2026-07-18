import { describe, expect, it, vi } from 'vitest';
import { registerProviderIpc } from './ipc-provider';

const ipcMocks = vi.hoisted(() => ({
  ipcMainHandle: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: ipcMocks.ipcMainHandle,
  },
}));

describe('provider IPC persistence boundary', () => {
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

function providerIpcContext(
  providerOverrides: Partial<ProviderRepository>,
  aiOverrides: Partial<ProviderAiModule> = {},
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
        saveSettings: vi.fn(),
        saveSettingsShell: vi.fn(),
        saveUser: vi.fn(),
      },
      storeSnapshot: { readStore: vi.fn() },
    }),
    sendFullStoreUpdated: vi.fn(),
  };
}
