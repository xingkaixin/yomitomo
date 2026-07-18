import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';

import { emptyProvider, providerDraftHasChanges } from '../settings/app-settings';

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

  it('treats a typed api key as a provider change', () => {
    expect(providerDraftHasChanges({ ...provider(), apiKey: 'new-key' }, provider())).toBe(true);
  });

  it('treats api key removal as a provider change', () => {
    expect(providerDraftHasChanges({ ...provider(), removeApiKey: true }, provider())).toBe(true);
  });

  it('ignores provider persistence metadata', () => {
    expect(
      providerDraftHasChanges(
        {
          ...provider(),
          hasApiKey: false,
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
        provider(),
      ),
    ).toBe(false);
  });

  it('detects provider model list changes', () => {
    expect(
      providerDraftHasChanges({ ...provider(), modelNames: ['model', 'model-next'] }, provider()),
    ).toBe(true);
  });
});

function provider(): LlmProvider {
  return {
    id: 'provider_1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.test',
    apiKey: '',
    hasApiKey: true,
    modelName: 'model',
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  };
}
