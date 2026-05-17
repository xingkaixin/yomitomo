import { describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  secrets: new Map<string, string>(),
  providerApiKeyRef: (providerId: string) => `provider:${providerId}:apiKey`,
}));

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/yomitomo-store-test',
  },
}));

vi.mock('./provider-secrets', () => {
  return {
    providerApiKeyRef: testState.providerApiKeyRef,
    saveProviderApiKey: async (providerId: string, apiKey: string) => {
      const ref = testState.providerApiKeyRef(providerId);
      testState.secrets.set(ref, apiKey);
      return ref;
    },
    readProviderApiKey: async (providerId: string, apiKeyRef?: string | null) =>
      testState.secrets.get(apiKeyRef || testState.providerApiKeyRef(providerId)) || '',
    deleteProviderApiKey: async (providerId: string, apiKeyRef?: string | null) => {
      testState.secrets.delete(apiKeyRef || testState.providerApiKeyRef(providerId));
    },
  };
});

import {
  buildArticleReadingProgressPatch,
  buildAgentRecord,
  buildProviderRecord,
  mergeSettingsForUpsert,
  resolveProviderApiKeyStorage,
} from './store';

describe('desktop store settings', () => {
  it('preserves missing settings fields during partial upserts', () => {
    expect(
      mergeSettingsForUpsert(
        {
          defaultProviderId: undefined,
          readingAssistantProviderId: undefined,
          reviewAssistantProviderId: undefined,
          saveArticleImages: true,
        },
        {
          defaultProviderId: 'provider_1',
          readingAssistantProviderId: 'provider_1',
          reviewAssistantProviderId: 'provider_1',
          messageSendShortcut: 'mod-enter',
          selectionActionShortcuts: { copy: 'X', annotate: 'B' },
          saveArticleImages: true,
          onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
        },
      ),
    ).toEqual({
      defaultProviderId: undefined,
      readingAssistantProviderId: undefined,
      reviewAssistantProviderId: undefined,
      messageSendShortcut: 'mod-enter',
      selectionActionShortcuts: { copy: 'X', annotate: 'B' },
      saveArticleImages: true,
      onboardingCompletedAt: '2026-05-12T00:00:00.000Z',
    });
  });
});

describe('desktop store providers', () => {
  it('resolves new provider api keys into keyring refs', async () => {
    testState.secrets.clear();

    await expect(
      resolveProviderApiKeyStorage('provider_1', { apiKey: ' sk-test ' }, undefined),
    ).resolves.toEqual({
      apiKeyRef: 'provider:provider_1:apiKey',
      storedApiKey: '',
    });
    expect(testState.secrets.get('provider:provider_1:apiKey')).toBe('sk-test');
  });

  it('preserves existing legacy api keys until migration can move them', async () => {
    await expect(
      resolveProviderApiKeyStorage('provider_1', {}, { apiKey: 'legacy-key', apiKeyRef: null }),
    ).resolves.toEqual({ storedApiKey: 'legacy-key' });
  });

  it('builds provider records without leaking api keys into the public store', () => {
    const provider = buildProviderRecord(
      {
        name: 'OpenAI',
        type: 'openai-chat',
        baseUrl: 'https://api.openai.com/v1',
        modelName: 'gpt-5.2',
        modelInputMode: 'custom',
      },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        apiKeyRef: 'provider:provider_1:apiKey',
        storedApiKey: '',
      },
    );

    expect(provider).toMatchObject({
      id: 'provider_1',
      name: 'OpenAI',
      apiKey: '',
      hasApiKey: true,
      modelInputMode: 'custom',
      modelNames: undefined,
      createdAt: '2026-05-16T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });

  it('builds provider records after api key removal without deleting settings', () => {
    const existing = {
      id: 'provider_1',
      name: 'DeepSeek',
      type: 'openai-chat' as const,
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      hasApiKey: true,
      modelName: 'deepseek-chat',
      modelInputMode: 'custom' as const,
      reasoningEffort: 'none' as const,
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-15T00:00:00.000Z',
    };
    const provider = buildProviderRecord(
      { id: 'provider_1', removeApiKey: true },
      {
        id: 'provider_1',
        now: '2026-05-16T00:00:00.000Z',
        existing,
        storedApiKey: '',
      },
    );

    expect(provider).toMatchObject({
      name: 'DeepSeek',
      apiKey: '',
      hasApiKey: false,
      modelName: 'deepseek-chat',
      createdAt: '2026-05-15T00:00:00.000Z',
      updatedAt: '2026-05-16T00:00:00.000Z',
    });
  });
});

describe('desktop store agents', () => {
  it('normalizes new agent records against the selected provider', () => {
    const agent = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: ' Reviewer ',
        username: ' @Reviewer Bot ',
        enabled: false,
        annotationDensity: 'high',
        temperature: 2,
      },
      {
        agents: [],
        providers: [
          {
            id: 'provider_1',
            name: 'Provider',
            type: 'openai-chat',
            baseUrl: 'https://api.example.com',
            apiKey: '',
            hasApiKey: false,
            modelName: 'model-a',
            modelInputMode: 'custom',
            reasoningEffort: 'none',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      },
      '2026-05-16T00:00:00.000Z',
    );

    expect(agent).toMatchObject({
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Reviewer',
      username: 'ReviewerBot',
      enabled: false,
      annotationDensity: 'high',
      temperature: 1,
    });
  });

  it('preserves existing agent fields on partial updates', () => {
    const created = buildAgentRecord(
      {
        kind: 'review',
        providerId: 'provider_1',
        nickname: 'Reviewer',
        username: 'reviewer',
        enabled: false,
        annotationDensity: 'low',
        temperature: 0.25,
      },
      {
        agents: [],
        providers: [],
      },
      '2026-05-16T00:00:00.000Z',
    );
    const updated = buildAgentRecord(
      { id: created.id, nickname: 'Updated Reviewer' },
      {
        agents: [created],
        providers: [],
      },
      '2026-05-16T01:00:00.000Z',
    );

    expect(updated).toMatchObject({
      id: created.id,
      kind: 'review',
      providerId: 'provider_1',
      nickname: 'Updated Reviewer',
      username: 'reviewer',
      enabled: false,
      annotationDensity: 'low',
      temperature: 0.25,
    });
  });
});

describe('desktop store reading progress', () => {
  it('builds only the article progress patch', () => {
    const readingProgress = {
      pageIndex: 3,
      pageCount: 12,
      chapterIndex: 1,
      chapterProgress: 0.25,
      progress: 0.31,
      updatedAt: '2026-05-17T08:00:00.000Z',
    };

    expect(buildArticleReadingProgressPatch('article_progress', readingProgress)).toEqual({
      articleId: 'article_progress',
      readingProgress,
      updatedAt: readingProgress.updatedAt,
    });
  });
});
