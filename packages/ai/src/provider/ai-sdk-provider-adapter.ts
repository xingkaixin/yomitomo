import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { LlmProvider, ReasoningEffort } from '@yomitomo/shared';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type ProviderOptions = Record<string, { [key: string]: JsonValue | undefined }>;

export type YomitomoLanguageModelAdapter = {
  model: LanguageModel;
  providerOptions: ProviderOptions;
  providerId: string;
  supportsTools: boolean;
  supportsStructuredOutput: boolean;
};

export function createYomitomoLanguageModel(provider: LlmProvider): YomitomoLanguageModelAdapter {
  if (provider.type === 'anthropic') {
    return {
      model: createAnthropic({
        apiKey: provider.apiKey,
        baseURL: trimSlash(provider.baseUrl),
      })(provider.modelName),
      providerOptions: anthropicProviderOptions(provider),
      providerId: 'anthropic',
      supportsTools: true,
      supportsStructuredOutput: true,
    };
  }

  if (provider.type === 'gemini') {
    return {
      model: createGoogleGenerativeAI({
        apiKey: provider.apiKey,
        baseURL: geminiBaseUrl(provider.baseUrl),
      })(provider.modelName),
      providerOptions: googleProviderOptions(provider),
      providerId: 'google',
      supportsTools: true,
      supportsStructuredOutput: true,
    };
  }

  if (isOfficialOpenAI(provider)) {
    const openai = createOpenAI({
      apiKey: provider.apiKey,
      baseURL: openAIBaseUrl(provider.baseUrl),
    });
    return {
      model:
        provider.type === 'openai-chat'
          ? openai.chat(provider.modelName)
          : openai.responses(provider.modelName),
      providerOptions: openAIProviderOptions(provider),
      providerId: 'openai',
      supportsTools: true,
      supportsStructuredOutput: true,
    };
  }

  const providerId = provider.presetId || provider.id || 'openai-compatible';
  const compatible = createOpenAICompatible({
    name: providerId,
    apiKey: provider.apiKey,
    baseURL: openAIBaseUrl(provider.baseUrl),
    includeUsage: true,
    supportsStructuredOutputs: supportsOpenAICompatibleStructuredOutput(provider),
    transformRequestBody: (body) => ({
      ...body,
      ...openAICompatibleReasoningParams(provider, numberField(body.max_tokens) || 0),
    }),
  });

  return {
    model: compatible(provider.modelName),
    providerOptions: {},
    providerId,
    supportsTools: true,
    supportsStructuredOutput: supportsOpenAICompatibleStructuredOutput(provider),
  };
}

export function supportsProviderTools(provider: LlmProvider) {
  if (provider.type === 'openai-responses') return isOfficialOpenAI(provider);
  return true;
}

function openAIProviderOptions(provider: LlmProvider): ProviderOptions {
  const effort = normalizeOpenAIEffort(provider.reasoningEffort || 'none');
  const openai: ProviderOptions['openai'] = {
    store: false,
    strictJsonSchema: true,
  };
  if (effort) openai.reasoningEffort = effort;
  return { openai };
}

function anthropicProviderOptions(provider: LlmProvider): ProviderOptions {
  const thinking = anthropicThinking(provider, 0);
  return thinking ? { anthropic: { thinking } } : {};
}

function googleProviderOptions(provider: LlmProvider): ProviderOptions {
  const thinkingConfig = geminiThinkingConfig(provider, 0);
  return thinkingConfig ? { google: { thinkingConfig } } : {};
}

function isOfficialOpenAI(provider: LlmProvider) {
  return provider.presetId === 'openai' || /^https:\/\/api\.openai\.com\/?/.test(provider.baseUrl);
}

function supportsOpenAICompatibleStructuredOutput(provider: LlmProvider) {
  return isOfficialOpenAI(provider);
}

function openAICompatibleReasoningParams(provider: LlmProvider, maxTokens: number) {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return {};
  const model = provider.modelName.toLowerCase();
  if (effort === 'none') {
    if (provider.presetId === 'dashscope' && /(qwen|deepseek|glm|kimi)/.test(model)) {
      return { enable_thinking: false };
    }
    if (/(doubao|glm|mimo|kimi|deepseek-v4|deepseek-v5)/.test(model)) {
      return { thinking: { type: 'disabled' } };
    }
    return {};
  }
  if (provider.presetId === 'dashscope' && /(qwen|deepseek|glm|kimi)/.test(model)) {
    return { enable_thinking: true, thinking_budget: thinkingBudget(effort, maxTokens) };
  }
  if (/doubao-seed-(1[-.]8|2[-.]0)/.test(model))
    return { reasoning_effort: normalizeOpenAIEffort(effort) };
  if (/doubao/.test(model)) {
    return effort === 'auto' ? { thinking: { type: 'auto' } } : { thinking: { type: 'enabled' } };
  }
  if (/(glm|mimo|kimi|deepseek)/.test(model)) return { thinking: { type: 'enabled' } };
  return { reasoning_effort: normalizeOpenAIEffort(effort) };
}

function anthropicThinking(
  provider: LlmProvider,
  maxTokens: number,
): { type: 'enabled' | 'disabled'; budgetTokens?: number } | null {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return null;
  if (effort === 'none') return { type: 'disabled' };
  const budget = thinkingBudget(effort, maxTokens - 1);
  return typeof budget === 'number' && budget >= 1024
    ? { type: 'enabled', budgetTokens: budget }
    : null;
}

function geminiThinkingConfig(provider: LlmProvider, maxTokens: number): JsonValue | undefined {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return undefined;
  if (effort === 'none') return { includeThoughts: false, thinkingBudget: 0 };
  if (effort === 'auto') return { includeThoughts: true, thinkingBudget: -1 };
  const budget = thinkingBudget(effort, maxTokens);
  return typeof budget === 'number'
    ? { includeThoughts: true, thinkingBudget: budget }
    : { includeThoughts: true };
}

function normalizeOpenAIEffort(effort: ReasoningEffort) {
  if (effort === 'default' || effort === 'auto') return undefined;
  if (effort === 'xhigh') return 'high';
  return effort;
}

function thinkingBudget(effort: ReasoningEffort, maxTokens: number) {
  const ratio: Record<ReasoningEffort, number> = {
    default: 0,
    none: 0,
    minimal: 0.05,
    low: 0.2,
    medium: 0.5,
    high: 0.8,
    xhigh: 1,
    auto: 0,
  };
  if (effort === 'auto') return undefined;
  return Math.min(maxTokens || 16_384, Math.max(1024, Math.round(16_384 * ratio[effort])));
}

export function openAIBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl);
  return /\/v\d+(?:beta)?$/.test(base) ? base : `${base}/v1`;
}

export function geminiBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl).replace(/\/v1beta$/, '');
  return `${base}/v1beta`;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function numberField(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
