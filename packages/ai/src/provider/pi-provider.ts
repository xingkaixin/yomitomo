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
import { OPENROUTER_MODELS } from '@earendil-works/pi-ai/providers/openrouter.models';
import { VERCEL_AI_GATEWAY_MODELS } from '@earendil-works/pi-ai/providers/vercel-ai-gateway.models';
import { XIAOMI_MODELS } from '@earendil-works/pi-ai/providers/xiaomi.models';
import { ZAI_MODELS } from '@earendil-works/pi-ai/providers/zai.models';
import {
  isChatGptOAuthProvider,
  providerPresets,
  type Agent,
  type LlmProvider,
  type ProviderPresetId,
} from '@yomitomo/shared';
import { geminiBaseUrl, openAIBaseUrl } from './provider-urls';

const CONTEXT_WINDOW = 128_000;
const MAX_OUTPUT_TOKENS = 4096;

type ModelCatalog = Readonly<Record<string, Model<Api>>>;

const lowToMaxThinking = { off: null, minimal: null, xhigh: 'xhigh', max: 'max' } as const;

// Chat Completions capabilities published by the gateways for these models.
// pi-ai's Vercel catalog describes Anthropic Messages, which uses different thinking controls.
const gatewayChatCapabilities: Record<
  string,
  | { temperature: boolean; thinkingLevelMap: NonNullable<Model<Api>['thinkingLevelMap']> }
  | undefined
> = {
  'anthropic/claude-sonnet-5.5': { temperature: false, thinkingLevelMap: lowToMaxThinking },
  'anthropic/claude-opus-5.5': { temperature: false, thinkingLevelMap: lowToMaxThinking },
  'anthropic/claude-haiku-5.5': {
    temperature: false,
    thinkingLevelMap: { off: 'none', minimal: null, xhigh: 'xhigh', max: 'max' },
  },
  'openai/gpt-6-astra': { temperature: false, thinkingLevelMap: lowToMaxThinking },
  'google/gemini-3.8-flash': {
    temperature: true,
    thinkingLevelMap: { off: null, minimal: null },
  },
  'deepseek/deepseek-v4.1-flash-1017': {
    temperature: true,
    thinkingLevelMap: { off: 'none', minimal: null, medium: null, max: 'max' },
  },
};

function gatewayCapabilities(provider: LlmProvider) {
  if (provider.presetId === 'vercel') {
    return gatewayChatCapabilities[provider.modelName.replace(/-(fast|batch)$/, '')];
  }
  if (provider.presetId === 'openrouter') return gatewayChatCapabilities[provider.modelName];
}

const PRESET_CATALOGS: Partial<Record<ProviderPresetId, ModelCatalog>> = {
  deepseek: DEEPSEEK_MODELS,
  moonshot: MOONSHOTAI_CN_MODELS,
  zhipu: ZAI_MODELS,
  mimo: XIAOMI_MODELS,
  openrouter: OPENROUTER_MODELS,
  vercel: VERCEL_AI_GATEWAY_MODELS,
};

export type PiModelRef = { provider: string; modelId: string };

export function piModelRef(provider: LlmProvider, agent: Pick<Agent, 'id'>): PiModelRef {
  return { provider: `${provider.id}~${agent.id}`, modelId: provider.modelName };
}

export type PiProviderOptions = {
  resolveApiKey?: () => Promise<string>;
};

// One pi provider per (provider, agent) pair carries the agent's sampling parameters, because
// pi-durable conversations reference a model and cannot set temperature per request.
export function piProviderFor(
  provider: LlmProvider,
  agent: Pick<Agent, 'id'> & { temperature?: number },
  options?: PiProviderOptions,
): Provider {
  const ref = piModelRef(provider, agent);
  const supportsTemperature = isChatGptOAuthProvider(provider)
    ? false
    : (gatewayCapabilities(provider)?.temperature ?? provider.presetId !== 'vercel');
  const model = {
    ...piModel(provider, ref.provider),
    // Thinking models reject or ignore temperature, so it only applies when thinking is off.
    samplingParamsByThinkingLevel: supportsTemperature
      ? { off: { temperature: agent.temperature } }
      : undefined,
  };
  return createProvider({
    id: ref.provider,
    name: provider.name,
    baseUrl: model.baseUrl,
    auth: {
      apiKey: {
        name: provider.name,
        resolve: async () => ({
          auth: {
            apiKey: options?.resolveApiKey ? await options.resolveApiKey() : provider.apiKey,
          },
          source: 'keyring',
        }),
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
  const known = catalogModel(provider);
  const model = modelWithCapabilities(fallbackModel(provider, providerId), provider, known);
  const contextWindow = known?.contextWindow ?? CONTEXT_WINDOW;
  const maxOutput = known?.maxTokens ?? presetMaxOutputTokens(provider) ?? MAX_OUTPUT_TOKENS;
  // Some models report an output limit as large as their whole window; half of it stays for input.
  return {
    ...model,
    contextWindow,
    maxTokens: Math.min(
      maxOutput,
      Math.floor(contextWindow / 2),
      // OpenRouter checks the key's credit against the requested output limit.
      provider.presetId === 'openrouter' ? MAX_OUTPUT_TOKENS : Infinity,
    ),
  };
}

// Sign in with ChatGPT tokens reach /v1/responses with stricter field rules than API keys:
// they require developer-role instructions and reject max_output_tokens, temperature, cache retention,
// mid-conversation effort updates, and hosted tool_search.
const CHATGPT_OAUTH_RESPONSES_COMPAT = {
  supportsDeveloperRole: true,
  supportsLongCacheRetention: false,
  supportsExplicitPromptCacheMode: false,
  supportsMaxOutputTokens: false,
  supportsMidConvoEffort: false,
  supportsToolSearch: false,
} as const;

function modelWithCapabilities(
  model: Model<Api>,
  provider: LlmProvider,
  known: Model<Api> | undefined,
): Model<Api> {
  if (isChatGptOAuthProvider(provider)) {
    const knownCompat =
      known && known.api === 'openai-responses'
        ? (known.compat as Record<string, unknown> | undefined)
        : undefined;
    return {
      ...model,
      // pi-ai sends system prompts as role:"developer" only when model.reasoning is true.
      reasoning: true,
      thinkingLevelMap: known?.thinkingLevelMap,
      compat: {
        ...(model.compat as Record<string, unknown> | undefined),
        ...knownCompat,
        ...CHATGPT_OAUTH_RESPONSES_COMPAT,
      },
    };
  }
  if (provider.reasoningEffort === 'default') return { ...model, reasoning: false };
  if (!known) return model;
  return {
    ...model,
    reasoning: known.reasoning,
    thinkingLevelMap: gatewayCapabilities(provider)?.thinkingLevelMap ?? known.thinkingLevelMap,
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
  const known = catalog?.[provider.modelName];
  if (
    known ||
    provider.type !== 'gemini' ||
    !['gemini-4-hydrogen', 'gemini-4-carbon'].includes(provider.modelName)
  ) {
    return known;
  }
  // pi-ai 1.5.2 lacks these models; Google rejects thinking budgets and the "off" level.
  return {
    ...fallbackModel(provider, provider.id),
    contextWindow: 1_048_576,
    maxTokens: 65_536,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      // pi-ai 1.5.2 cannot encode Google's XHIGH yet, so clamp it to HIGH.
      xhigh: null,
      max: null,
    },
  };
}

function presetMaxOutputTokens(provider: LlmProvider) {
  const preset = providerPresets.find((item) => item.id === provider.presetId);
  return preset?.maxOutputTokens?.[provider.modelName];
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
  if (isChatGptOAuthProvider(provider)) {
    return {
      ...base,
      api: 'openai-responses',
      baseUrl: 'https://api.openai.com/v1',
      compat: CHATGPT_OAUTH_RESPONSES_COMPAT,
    };
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
  const effort = provider.reasoningEffort || 'none';
  return {
    ...base,
    api: 'openai-completions',
    baseUrl,
    reasoning: provider.presetId === 'openrouter' ? effort !== 'none' : thinking !== null,
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
  if (provider.presetId === 'openrouter') return { thinkingFormat: 'openrouter' };
  if (provider.presetId === 'vercel') {
    return effort === 'none' ? null : { thinkingFormat: 'openai' };
  }
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
  return (
    provider.presetId === 'openai' ||
    isChatGptOAuthProvider(provider) ||
    /^https:\/\/api\.openai\.com\/?/.test(provider.baseUrl)
  );
}
