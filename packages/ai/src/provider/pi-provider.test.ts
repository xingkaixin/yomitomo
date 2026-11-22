import { createModels } from '@earendil-works/pi-ai/models';
import type { LlmProvider, ReasoningEffort } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import {
  piModelRef,
  piProviderFor,
  piThinkingLevel,
  providerThinkingCapabilities,
} from './pi-provider';

const agent = { id: 'agent-1', temperature: 0.3 };

async function requestPayload(
  provider: LlmProvider,
  options?: {
    systemPrompt?: string;
    maxTokens?: number;
    temperature?: number;
    resolveApiKey?: () => Promise<string>;
  },
) {
  const models = createModels();
  models.setProvider(
    piProviderFor(
      provider,
      agent,
      options?.resolveApiKey ? { resolveApiKey: options.resolveApiKey } : undefined,
    ),
  );
  const ref = piModelRef(provider, agent);
  const model = models.getModel(ref.provider, ref.modelId)!;
  const controller = new AbortController();
  let payload: Record<string, unknown> | undefined;
  // pi-durable omits `reasoning` for an unset or "off" thinking level.
  const thinkingLevel = piThinkingLevel(provider);
  await models.completeSimple(
    model,
    {
      systemPrompt: options?.systemPrompt,
      messages: [{ role: 'user', content: 'hi', timestamp: 0 }],
    },
    {
      ...(thinkingLevel && thinkingLevel !== 'off' ? { reasoning: thinkingLevel } : {}),
      maxTokens: options?.maxTokens,
      temperature: options?.temperature,
      signal: controller.signal,
      onPayload: (value) => {
        payload = value as Record<string, unknown>;
        controller.abort();
      },
    },
  );
  return payload;
}

function compatible(
  presetId: LlmProvider['presetId'],
  modelName: string,
  reasoningEffort: ReasoningEffort,
  type: LlmProvider['type'] = 'openai-chat',
): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Provider',
    type,
    presetId,
    baseUrl: 'https://example.invalid/v1',
    apiKey: 'key',
    modelName,
    reasoningEffort,
    createdAt: '',
    updatedAt: '',
  };
}

describe('piProviderFor', () => {
  it.each([
    ['gemini-4-hydrogen', 'none', 'LOW'],
    ['gemini-4-hydrogen', 'xhigh', 'HIGH'],
    ['gemini-4-carbon', 'none', 'LOW'],
    ['gemini-4-carbon', 'xhigh', 'HIGH'],
  ] as const)('sends supported %s thinking %s', async (modelName, effort, thinkingLevel) => {
    const provider = compatible('gemini', modelName, effort, 'gemini');
    const payload = await requestPayload(provider);
    expect(payload).toMatchObject({
      model: modelName,
      config: { maxOutputTokens: 65_536, thinkingConfig: { thinkingLevel } },
    });
    expect(payload).not.toHaveProperty('config.thinkingConfig.thinkingBudget');
    expect(payload).not.toHaveProperty('config.temperature');
    const models = createModels();
    models.setProvider(piProviderFor(provider, agent));
    const ref = piModelRef(provider, agent);
    expect(models.getModel(ref.provider, ref.modelId)?.contextWindow).toBe(1_048_576);
  });

  it.each([
    ['dashscope', 'qwen3.5-plus', 'none', { enable_thinking: false, temperature: 0.3 }],
    ['dashscope', 'qwen3.5-plus', 'high', { enable_thinking: true }],
    ['zhipu', 'glm-5', 'none', { thinking: { type: 'disabled' }, temperature: 0.3 }],
    ['zhipu', 'glm-5', 'medium', { thinking: { type: 'enabled' } }],
    ['deepseek', 'deepseek-v4', 'none', { thinking: { type: 'disabled' }, temperature: 0.3 }],
  ] as const)('sends %s %s thinking %s', async (presetId, model, effort, expected) => {
    const payload = await requestPayload(compatible(presetId, model, effort));
    expect(payload).toMatchObject({ model, ...expected });
    expect(payload).not.toHaveProperty('store');
  });

  it('omits temperature once a compatible model thinks', async () => {
    const payload = await requestPayload(compatible('deepseek', 'deepseek-flash', 'high'));
    expect(payload).toMatchObject({ thinking: { type: 'enabled' } });
    expect(payload).not.toHaveProperty('temperature');
  });

  it('uses the lowest thinking level for models that cannot turn thinking off', async () => {
    const claude = await requestPayload(
      compatible('anthropic', 'claude-sonnet-5-5', 'none', 'anthropic'),
    );
    expect(claude).not.toHaveProperty('temperature');
    expect(claude).toMatchObject({ thinking: { type: 'adaptive' } });

    const gemini = await requestPayload(compatible('gemini', 'gemini-3.8-flash', 'none', 'gemini'));
    expect(gemini).toMatchObject({ config: { thinkingConfig: { thinkingLevel: 'LOW' } } });

    const openai = await requestPayload(compatible('openai', 'gpt-6-astra', 'none'));
    expect(openai).toMatchObject({ reasoning_effort: 'low' });
    expect(openai).not.toHaveProperty('temperature');
  });

  it('uses OpenRouter reasoning format without direct-vendor thinking fields', async () => {
    const deepseekOff = await requestPayload(
      compatible('openrouter', 'deepseek/deepseek-v4.1-flash-1017', 'none'),
    );
    expect(deepseekOff).toMatchObject({ reasoning: { effort: 'none' }, temperature: 0.3 });
    expect(deepseekOff).not.toHaveProperty('thinking');

    const claude = await requestPayload(
      compatible('openrouter', 'anthropic/claude-sonnet-5.5', 'none'),
    );
    expect(claude).toMatchObject({ reasoning: { effort: 'low' }, max_tokens: 4096 });
    expect(claude).not.toHaveProperty('thinking');
    expect(claude).not.toHaveProperty('temperature');

    const unknownOff = await requestPayload(
      compatible('openrouter', 'custom/unknown-model', 'none'),
    );
    expect(unknownOff).toMatchObject({ temperature: 0.3 });
    expect(unknownOff).not.toHaveProperty('reasoning');
  });

  it.each([
    ['anthropic/claude-sonnet-5.5', 'low'],
    ['anthropic/claude-opus-5.5', 'low'],
    ['anthropic/claude-haiku-5.5', 'none'],
  ])('sends supported Vercel defaults for %s', async (model, effort) => {
    const payload = await requestPayload(compatible('vercel', model, 'none'));
    expect(payload).toHaveProperty('reasoning_effort', effort);
    expect(payload).not.toHaveProperty('temperature');
  });

  it('uses standard OpenAI reasoning_effort on Vercel AI Gateway without vendor-specific fields', async () => {
    const deepseekOff = await requestPayload(
      compatible('vercel', 'deepseek/deepseek-v4.1-flash-1017', 'none'),
    );
    expect(deepseekOff).toMatchObject({ temperature: 0.3 });
    expect(deepseekOff).not.toHaveProperty('thinking');
    expect(deepseekOff).toHaveProperty('reasoning_effort', 'none');

    const deepseekHigh = await requestPayload(
      compatible('vercel', 'deepseek/deepseek-v4.1-flash-1017', 'high'),
    );
    expect(deepseekHigh).toMatchObject({ reasoning_effort: 'high' });
    expect(deepseekHigh).not.toHaveProperty('thinking');
    expect(deepseekHigh).not.toHaveProperty('temperature');
  });

  it('shapes ChatGPT Sign-in requests for /v1/responses without unsupported fields', async () => {
    const provider = compatible('chatgpt', 'gpt-5.4', 'none', 'openai-responses');
    const payload = await requestPayload(provider, {
      systemPrompt: 'Follow reading instructions.',
      maxTokens: 1024,
    });
    const wireBody = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(wireBody).toMatchObject({
      model: 'gpt-5.4',
      store: false,
      stream: true,
    });
    expect(wireBody).not.toHaveProperty('max_output_tokens');
    expect(wireBody).not.toHaveProperty('temperature');
    expect(wireBody).not.toHaveProperty('prompt_cache_retention');
    expect(wireBody).not.toHaveProperty('prompt_cache_options');
    expect(wireBody.input).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'developer', content: 'Follow reading instructions.' }),
      ]),
    );
  });

  it('clamps unsupported none effort on gpt-6.2-sol to low and exposes only supported thinking levels', async () => {
    const provider = compatible('chatgpt', 'gpt-6.2-sol', 'none', 'openai-responses');
    expect(providerThinkingCapabilities(provider)).toEqual({
      supportedEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      defaultEffort: 'low',
    });
    expect(piThinkingLevel(provider)).toBe('low');

    const payload = await requestPayload(provider, { systemPrompt: 'Read carefully.' });
    const wireBody = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(wireBody.reasoning).toMatchObject({ effort: 'low' });

    const maxPayload = await requestPayload(
      compatible('chatgpt', 'gpt-6.2-sol', 'max', 'openai-responses'),
    );
    expect(maxPayload?.reasoning).toMatchObject({ effort: 'max' });
  });

  it('includes none when supported and omits reasoning for non-thinking ChatGPT models', async () => {
    expect(
      providerThinkingCapabilities(compatible('chatgpt', 'gpt-5.4', 'none', 'openai-responses')),
    ).toEqual({
      supportedEfforts: ['none', 'low', 'medium', 'high', 'xhigh'],
      defaultEffort: 'none',
    });

    const gpt4o = compatible('chatgpt', 'gpt-4o', 'none', 'openai-responses');
    expect(providerThinkingCapabilities(gpt4o)).toEqual({
      supportedEfforts: [],
      defaultEffort: 'none',
    });
    expect(piThinkingLevel(gpt4o)).toBeUndefined();
    const payload = await requestPayload(gpt4o, { systemPrompt: 'Hello.' });
    const wireBody = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    expect(wireBody).not.toHaveProperty('reasoning');
    expect(wireBody.input).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'developer', content: 'Hello.' })]),
    );
  });

  it('resolves dynamic OAuth tokens on each request through resolveApiKey', async () => {
    const provider = compatible('chatgpt', 'gpt-5.4', 'none', 'openai-responses');
    let tokenVersion = 0;
    const piProvider = piProviderFor(provider, agent, {
      resolveApiKey: async () => `oauth-token-${++tokenVersion}`,
    });
    const first = await piProvider.auth?.apiKey?.resolve({} as never);
    const second = await piProvider.auth?.apiKey?.resolve({} as never);
    expect(first?.auth).toEqual({ apiKey: 'oauth-token-1' });
    expect(second?.auth).toEqual({ apiKey: 'oauth-token-2' });
  });
});
