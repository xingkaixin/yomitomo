import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider, ResolvedAppSettings } from '@yomitomo/shared';
import { desktopIpcErrorCodes } from '../../ipc-errors';
import { ProviderApiKeyRequiredError } from '../providers/provider-repository';
import { taskProvider } from './agent-runtime-routing';

describe('taskProvider', () => {
  it('maps missing API keys to a structured IPC error', async () => {
    const provider = { id: 'provider-1' } as LlmProvider;
    const context = {
      getPersistenceModules: async () => ({
        providerRepository: {
          hydrateProviderApiKey: vi.fn(async () => {
            throw new ProviderApiKeyRequiredError();
          }),
        },
      }),
    };

    await expect(
      taskProvider(
        context,
        [provider],
        {
          defaultProviderId: provider.id,
          readingAssistantProviderId: provider.id,
        } as ResolvedAppSettings,
        'readingAssistant',
      ),
    ).rejects.toMatchObject({ code: desktopIpcErrorCodes.providerApiKeyRequired });
  });
});
