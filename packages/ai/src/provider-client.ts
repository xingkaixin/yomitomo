import type { LlmProvider, ProviderModel } from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';
import { normalizeAnthropicError } from './budget';
import { geminiBaseUrl, openAIBaseUrl } from './ai-sdk-provider-adapter';
import { generateYomitomoText, streamYomitomoText } from './generation-runtime';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

export type GenerateOptions = {
  failOnMaxTokens?: boolean;
};

export type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  description?: string;
};

export type ResponseSchema = {
  name: string;
  schema: JsonSchema;
  strict?: boolean;
};

export type TextPayload = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  responseSchema?: ResponseSchema;
};

export async function listProviderModels(provider: Partial<LlmProvider>): Promise<ProviderModel[]> {
  const normalized = normalizeProvider(provider);
  if (normalized.type === 'gemini') return listGeminiModels(normalized);
  if (normalized.type === 'anthropic') return listAnthropicModels(normalized);
  return listOpenAICompatibleModels(normalized);
}

export async function callProviderText(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions = {},
) {
  const result = await generateYomitomoText(provider, payload, options);
  return result.text;
}

export async function streamProviderText(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  return streamYomitomoText(provider, payload, onDelta);
}

function normalizeProvider(provider: Partial<LlmProvider>): LlmProvider {
  const preset =
    providerPresets.find((item) => item.id === provider.presetId) || defaultProviderPreset;
  const now = new Date(0).toISOString();
  return {
    id: provider.id || 'draft',
    name: provider.name || preset?.name || 'Provider',
    type: provider.type || preset?.type || 'openai-chat',
    presetId: provider.presetId,
    logo: provider.logo || preset?.logo,
    baseUrl: provider.baseUrl || preset?.baseUrl || 'https://api.deepseek.com',
    apiKey: provider.apiKey || '',
    modelName: provider.modelName || preset?.modelName || 'deepseek-chat',
    reasoningEffort: provider.reasoningEffort || 'none',
    createdAt: provider.createdAt || now,
    updatedAt: provider.updatedAt || now,
  };
}

async function listOpenAICompatibleModels(provider: LlmProvider) {
  const response = await fetch(`${openAIBaseUrl(provider.baseUrl)}/models`, {
    headers: bearerHeaders(provider),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  const data = (await response.json()) as { data?: Array<{ id?: string; name?: string }> };
  return modelList(
    data.data?.map((model) => ({
      id: model.id || '',
      name: model.name || model.id || '',
    })),
    provider,
  );
}

async function listAnthropicModels(provider: LlmProvider) {
  const response = await fetch(`${trimSlash(provider.baseUrl)}/v1/models`, {
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': provider.apiKey,
    },
  });
  if (!response.ok)
    throw new Error(normalizeAnthropicError(response.status, await response.text()));
  const data = (await response.json()) as {
    data?: Array<{ id?: string; display_name?: string }>;
  };
  return modelList(
    data.data?.map((model) => ({
      id: model.id || '',
      name: model.display_name || model.id || '',
    })),
    provider,
  );
}

async function listGeminiModels(provider: LlmProvider) {
  const url = `${geminiBaseUrl(provider.baseUrl)}/models?key=${encodeURIComponent(provider.apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(await modelListError(response));
  const data = (await response.json()) as {
    models?: Array<{ name?: string; displayName?: string }>;
  };
  return modelList(
    data.models?.map((model) => {
      const id = (model.name || '').replace(/^models\//, '');
      return { id, name: model.displayName || id };
    }),
    provider,
  );
}

function modelList(models: ProviderModel[] | undefined, provider: LlmProvider) {
  const fetched = (models || []).filter((model) => model.id.trim());
  if (fetched.length > 0) return dedupeModels(fetched);
  const preset = providerPresets.find((item) => item.id === provider.presetId);
  return (preset?.modelNames || []).map((id) => ({ id, name: id }));
}

function bearerHeaders(provider: LlmProvider): Record<string, string> {
  return provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
}

function dedupeModels(models: ProviderModel[]) {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

async function modelListError(response: Response) {
  const text = await response.text();
  return `模型服务请求失败：${response.status} ${text.slice(0, 400)}`;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}
