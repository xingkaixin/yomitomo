import { describe, expect, it, vi } from 'vitest';
import type { DesktopMainIpcContext } from './ipc';
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

    registerProviderIpc({
      getPersistenceModule: async () => ({
        providerPersistence: { readStoredProviderApiKey },
      }),
    } as unknown as DesktopMainIpcContext);

    const handler = ipcMocks.ipcMainHandle.mock.calls.find(
      ([channel]) => channel === 'provider:read-api-key',
    )?.[1];
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, 'provider_1');

    expect(result).toEqual({ ok: true, value: 'provider-secret' });
    expect(readStoredProviderApiKey).toHaveBeenCalledWith('provider_1');
  });
});
