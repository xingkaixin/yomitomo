import { describe, expect, it, vi } from 'vitest';
import type { LlmProvider, ResolvedAppSettings } from '@yomitomo/shared';
import { desktopIpcErrorCodes } from '../../ipc-errors';
import { ProviderApiKeyRequiredError } from '../providers/provider-repository';
import { selectAgentRuntime, taskProvider } from './agent-runtime-routing';

describe('selectAgentRuntime', () => {
  it('selects supported runtimes only in deep verification mode', () => {
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBe('thread_reply');
    expect(
      selectAgentRuntime({
        requestedMode: 'deep_verification',
        taskType: 'distillation_review',
        supportedTaskTypes: ['thread_reply', 'create_thought'],
      }),
    ).toBeNull();
    expect(
      selectAgentRuntime({
        requestedMode: 'fast_response',
        taskType: 'thread_reply',
        supportedTaskTypes: ['thread_reply'],
      }),
    ).toBeNull();
  });
});

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
