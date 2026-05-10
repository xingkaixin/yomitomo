import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';

import { emptyProvider, providerDraftHasChanges } from '../app-settings';

describe('provider defaults', () => {
  it('uses DeepSeek with reasoning disabled for new providers', () => {
    expect(emptyProvider).toMatchObject({
      presetId: 'deepseek',
      name: '深度求索',
      type: 'openai-chat',
      baseUrl: 'https://api.deepseek.com',
      modelName: 'deepseek-chat',
      reasoningEffort: 'none',
    });
  });

  it('treats missing reasoning effort as disabled', () => {
    const currentProvider = provider();

    expect(
      providerDraftHasChanges({ ...currentProvider, reasoningEffort: 'none' }, currentProvider),
    ).toBe(false);
  });
});

function provider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.test',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  };
}
