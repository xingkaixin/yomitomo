import type {
  Api,
  Model,
  ModelThinkingLevel,
  OpenAICompletionsCompat,
} from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { googleGenerativeAIApi } from '@earendil-works/pi-ai/api/google-generative-ai.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { clampThinkingLevel, createProvider, type Provider } from '@earendil-works/pi-ai/models';
import { ANTHROPIC_MODELS } from '@earendil-works/pi-ai/providers/anthropic.models';
import { DEEPSEEK_MODELS } from '@earendil-works/pi-ai/providers/deepseek.models';
import { GOOGLE_MODELS } from '@earendil-works/pi-ai/providers/google.models';
import { MOONSHOTAI_CN_MODELS } from '@earendil-works/pi-ai/providers/moonshotai-cn.models';
import { OPENAI_MODELS } from '@earendil-works/pi-ai/providers/openai.models';
import { XIAOMI_MODELS } from '@earendil-works/pi-ai/providers/xiaomi.models';
import { ZAI_MODELS } from '@earendil-works/pi-ai/providers/zai.models';
import type { Agent, LlmProvider, ProviderPresetId } from '@yomitomo/shared';
import { geminiBaseUrl, openAIBaseUrl } from './provider-urls';

const CONTEXT_WINDOW = 128_000;
const MAX_OUTPUT_TOKENS = 4096;

type ModelCatalog = Readonly<Record<string, Model<Api>>>;

const PRESET_CATALOGS: Partial<Record<ProviderPresetId, ModelCatalog>> = {
  deepseek: DEEPSEEK_MODELS,
  moonshot: MOONSHOTAI_CN_MODELS,
  zhipu: ZAI_MODELS,
  mimo: XIAOMI_MODELS,
};

export type PiModelRef = { provider: string; modelId: string };

export function piModelRef(provider: LlmProvider, agent: Pick<Agent, 'id'>): PiModelRef {
  return { provider: `${provider.id}~${agent.id}`, modelId: provider.modelName };
}

// One pi provider per (provider, agent) pair carries the agent's sampling parameters, because
// pi-durable conversations reference a model and cannot set temperature per request.
export function piProviderFor(
  provider: LlmProvider,
  agent: Pick<Agent, 'id'> & { temperature?: number },
): Provider {
  const ref = piModelRef(provider, agent);
  const model = {
    ...piModel(provider, ref.provider),
    // Thinking models reject or ignore temperature, so it only applies when thinking is off.
    samplingParamsByThinkingLevel: { off: { temperature: agent.temperature } },
  };
  return createProvider({
    id: ref.provider,
    name: provider.name,
    baseUrl: model.baseUrl,
    auth: {
      apiKey: {
        name: provider.name,
        resolve: async () => ({ auth: { apiKey: provider.apiKey }, source: 'keyring' }),
      },
    },
    models: [model],
    api: {
      'anthropic-messages': anthropicMessagesApi(),
      'google-generative-ai': googleGenerativeAIApi(),
      'openai-completions': openAICompletionsApi(),
      'openai-responses': openAIResponsesApi(),
    },
  });
}

// Models that cannot turn thinking off get their lowest supported level instead of "off".
export function piThinkingLevel(provider: LlmProvider): ModelThinkingLevel | undefined {
  const effort = provider.reasoningEffort ?? 'none';
  if (effort === 'default' || effort === 'auto') return undefined;
  return clampThinkingLevel(piModel(provider, provider.id), effort === 'none' ? 'off' : effort);
}

function piModel(provider: LlmProvider, providerId: string): Model<Api> {
  const model = fallbackModel(provider, providerId);
  if (provider.reasoningEffort === 'default') return { ...model, reasoning: false };
  const known = catalogModel(provider);
  if (!known) return model;
  return {
    ...model,
    reasoning: known.reasoning,
    thinkingLevelMap: known.thinkingLevelMap,
    contextWindow: known.contextWindow,
    ...(known.api === model.api && { compat: { ...model.compat, ...known.compat } }),
  };
}

function catalogModel(provider: LlmProvider): Model<Api> | undefined {
  const catalog: ModelCatalog | undefined =
    provider.type === 'anthropic'
      ? ANTHROPIC_MODELS
      : provider.type === 'gemini'
        ? GOOGLE_MODELS
        : isOfficialOpenAI(provider)
          ? OPENAI_MODELS
          : provider.presetId && PRESET_CATALOGS[provider.presetId];
  return catalog?.[provider.modelName];
}

function fallbackModel(provider: LlmProvider, providerId: string): Model<Api> {
  const base = {
    id: provider.modelName,
    name: provider.modelName,
    provider: providerId,
    input: ['text' as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: CONTEXT_WINDOW,
    maxTokens: MAX_OUTPUT_TOKENS,
    reasoning: true,
  };
  if (provider.type === 'anthropic') {
    return {
      ...base,
      api: 'anthropic-messages',
      baseUrl: provider.baseUrl.replace(/\/+$/, '').replace(/\/v1$/, ''),
    };
  }
  if (provider.type === 'gemini') {
    return { ...base, api: 'google-generative-ai', baseUrl: geminiBaseUrl(provider.baseUrl) };
  }
  const baseUrl = openAIBaseUrl(provider.baseUrl);
  if (isOfficialOpenAI(provider)) {
    return {
      ...base,
      api: provider.type === 'openai-chat' ? 'openai-completions' : 'openai-responses',
      baseUrl,
    };
  }
  const thinking = compatibleThinking(provider);
  return {
    ...base,
    api: 'openai-completions',
    baseUrl,
    reasoning: thinking !== null,
    compat: {
      supportsDeveloperRole: false,
      supportsStore: false,
      maxTokensField: 'max_tokens',
      ...thinking,
    },
  } satisfies Model<'openai-completions'>;
}

function compatibleThinking(provider: LlmProvider): OpenAICompletionsCompat | null {
  const effort = provider.reasoningEffort || 'none';
  const model = provider.modelName.toLowerCase();
  if (provider.presetId === 'dashscope' && /(qwen|deepseek|glm|kimi)/.test(model)) {
    return { thinkingFormat: 'qwen', thinkingTokenBudgetField: 'thinking_budget' };
  }
  if (/doubao-seed-(1[-.]8|2[-.]0)/.test(model)) return { thinkingFormat: 'deepseek' };
  if (/deepseek/.test(model)) return { thinkingFormat: 'deepseek' };
  if (/(doubao|glm|mimo|kimi)/.test(model)) return { thinkingFormat: 'zai' };
  return effort === 'none' ? null : { thinkingFormat: 'openai' };
}

function isOfficialOpenAI(provider: LlmProvider) {
  return provider.presetId === 'openai' || /^https:\/\/api\.openai\.com\/?/.test(provider.baseUrl);
}
