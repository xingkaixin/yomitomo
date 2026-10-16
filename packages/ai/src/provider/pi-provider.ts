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
import { createProvider, type Provider } from '@earendil-works/pi-ai/models';
import type { Agent, LlmProvider, ReasoningEffort } from '@yomitomo/shared';
import { geminiBaseUrl, openAIBaseUrl } from './ai-sdk-provider-adapter';

const CONTEXT_WINDOW = 128_000;
const MAX_OUTPUT_TOKENS = 4096;

export type PiModelRef = { provider: string; modelId: string };

export function piModelRef(provider: LlmProvider, agent: Pick<Agent, 'id'>): PiModelRef {
  return { provider: `${provider.id}~${agent.id}`, modelId: provider.modelName };
}

// One pi provider per (provider, agent) pair carries the agent's sampling parameters, because
// pi-durable conversations reference a model and cannot set temperature per request.
export function piProviderFor(
  provider: LlmProvider,
  agent: Pick<Agent, 'id' | 'temperature'>,
): Provider {
  const ref = piModelRef(provider, agent);
  const model = {
    ...piModel(provider, ref.provider),
    samplingParams: { temperature: agent.temperature },
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

export function piThinkingLevel(
  effort: ReasoningEffort | undefined,
): ModelThinkingLevel | undefined {
  switch (effort ?? 'none') {
    case 'default':
    case 'auto':
      return undefined;
    case 'none':
      return 'off';
    case 'xhigh':
      return 'high';
    default:
      return effort as ModelThinkingLevel;
  }
}

function piModel(provider: LlmProvider, providerId: string): Model<Api> {
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
  if (effort === 'default') return null;
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
