import { createModels } from '@earendil-works/pi-ai/models';
import type { LlmProvider, ReasoningEffort } from '@yomitomo/shared';
import { describe, expect, it } from 'vitest';
import { piModelRef, piProviderFor, piThinkingLevel } from './pi-provider';

const agent = { id: 'agent-1', temperature: 0.3 };

async function requestPayload(provider: LlmProvider) {
  const models = createModels();
  models.setProvider(piProviderFor(provider, agent));
  const ref = piModelRef(provider, agent);
  const model = models.getModel(ref.provider, ref.modelId)!;
  const controller = new AbortController();
  let payload: Record<string, unknown> | undefined;
  // pi-durable omits `reasoning` for an unset or "off" thinking level.
  const thinkingLevel = piThinkingLevel(provider);
  await models.completeSimple(
    model,
    { messages: [{ role: 'user', content: 'hi', timestamp: 0 }] },
    {
      ...(thinkingLevel && thinkingLevel !== 'off' ? { reasoning: thinkingLevel } : {}),
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

  it.each([
    ['moonshot', 'moonshot-v1-auto', 'none'],
    ['dashscope', 'qwen3.5-plus', 'default'],
  ] as const)(
    'leaves %s %s thinking %s to the provider default',
    async (presetId, model, effort) => {
      const payload = await requestPayload(compatible(presetId, model, effort));
      expect(payload).not.toHaveProperty('reasoning_effort');
      expect(payload).not.toHaveProperty('thinking');
      expect(payload).not.toHaveProperty('enable_thinking');
    },
  );

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
});
