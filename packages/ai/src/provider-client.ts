import type { LlmProvider, ProviderModel, ReasoningEffort } from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';
import { normalizeAnthropicError } from './budget';
import { logAiInfo } from './logger';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

export type GenerateOptions = {
  failOnMaxTokens?: boolean;
};

export type TextPayload = {
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
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
  switch (provider.type) {
    case 'openai-chat':
      return callOpenAIChat(provider, payload, options);
    case 'openai-responses':
      return callOpenAIResponses(provider, payload, options);
    case 'anthropic':
      return callAnthropic(provider, payload, options);
    case 'gemini':
      return callGemini(provider, payload);
  }
}

export async function streamProviderText(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  switch (provider.type) {
    case 'openai-chat':
      return streamOpenAIChat(provider, payload, onDelta);
    case 'openai-responses':
      return streamOpenAIResponses(provider, payload, onDelta);
    case 'anthropic':
      return streamAnthropic(provider, payload, onDelta);
    case 'gemini':
      return streamGemini(provider, payload, onDelta);
  }
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

async function callOpenAIChat(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions,
) {
  const body = openAIChatBody(provider, payload, false);
  logProviderRequest(
    provider,
    `${openAIBaseUrl(provider.baseUrl)}/chat/completions`,
    payload,
    false,
  );
  const response = await fetch(`${openAIBaseUrl(provider.baseUrl)}/chat/completions`, {
    method: 'POST',
    headers: jsonBearerHeaders(provider),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('模型返回为空');
  if (options.failOnMaxTokens && data.choices?.[0]?.finish_reason === 'length') {
    throw new Error(`模型输出达到 max_tokens=${payload.maxTokens}，结构化 JSON 可能已被截断`);
  }
  logProviderResponse(provider, text.length, data.usage);
  return text;
}

async function streamOpenAIChat(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  const url = `${openAIBaseUrl(provider.baseUrl)}/chat/completions`;
  logProviderRequest(provider, url, payload, true);
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonBearerHeaders(provider),
    body: JSON.stringify(openAIChatBody(provider, payload, true)),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  await readSse(response, (data) => {
    const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
    const delta = parsed.choices?.[0]?.delta?.content;
    if (delta) onDelta(delta);
  });
}

async function callOpenAIResponses(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions,
) {
  const url = `${openAIBaseUrl(provider.baseUrl)}/responses`;
  logProviderRequest(provider, url, payload, false);
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonBearerHeaders(provider),
    body: JSON.stringify(openAIResponsesBody(provider, payload, false)),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
    status?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = extractResponsesText(data).trim();
  if (!text) throw new Error('OpenAI 返回为空');
  if (options.failOnMaxTokens && data.status === 'incomplete') {
    throw new Error(
      `模型输出达到 max_output_tokens=${payload.maxTokens}，结构化 JSON 可能已被截断`,
    );
  }
  logProviderResponse(provider, text.length, data.usage);
  return text;
}

async function streamOpenAIResponses(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  const url = `${openAIBaseUrl(provider.baseUrl)}/responses`;
  logProviderRequest(provider, url, payload, true);
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonBearerHeaders(provider),
    body: JSON.stringify(openAIResponsesBody(provider, payload, true)),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  await readSse(response, (data) => {
    const parsed = JSON.parse(data) as { type?: string; delta?: string };
    if (parsed.type === 'response.output_text.delta' && parsed.delta) onDelta(parsed.delta);
  });
}

async function callAnthropic(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions,
) {
  const url = `${trimSlash(provider.baseUrl)}/v1/messages`;
  logProviderRequest(provider, url, payload, false);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody(provider, payload, false)),
  });
  if (!response.ok)
    throw new Error(normalizeAnthropicError(response.status, await response.text()));
  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content
    ?.map((part) => (part.type === 'text' ? part.text || '' : ''))
    .join('\n')
    .trim();
  if (!text) throw new Error('Anthropic 返回为空');
  if (options.failOnMaxTokens && data.stop_reason === 'max_tokens') {
    throw new Error(`模型输出达到 max_tokens=${payload.maxTokens}，结构化 JSON 可能已被截断`);
  }
  logProviderResponse(provider, text.length, data.usage);
  return text;
}

async function streamAnthropic(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  const url = `${trimSlash(provider.baseUrl)}/v1/messages`;
  logProviderRequest(provider, url, payload, true);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': provider.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(anthropicBody(provider, payload, true)),
  });
  if (!response.ok)
    throw new Error(normalizeAnthropicError(response.status, await response.text()));
  await readSse(response, (data) => {
    const parsed = JSON.parse(data) as {
      type?: string;
      delta?: { type?: string; text?: string };
    };
    if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
      onDelta(parsed.delta.text || '');
    }
  });
}

async function callGemini(provider: LlmProvider, payload: TextPayload) {
  const url = geminiGenerateUrl(provider, false);
  logProviderRequest(provider, url, payload, false);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(geminiBody(provider, payload)),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  const data = await response.json();
  const text = extractGeminiText(data).trim();
  if (!text) throw new Error('Gemini 返回为空');
  logProviderResponse(provider, text.length);
  return text;
}

async function streamGemini(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  const url = geminiGenerateUrl(provider, true);
  logProviderRequest(provider, url, payload, true);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(geminiBody(provider, payload)),
  });
  if (!response.ok) throw new Error(await modelListError(response));
  await readSse(response, (data) => onDelta(extractGeminiText(JSON.parse(data))));
}

function openAIChatBody(provider: LlmProvider, payload: TextPayload, stream: boolean) {
  return {
    model: provider.modelName,
    messages: [
      { role: 'system', content: payload.system },
      { role: 'user', content: payload.user },
    ],
    max_tokens: payload.maxTokens,
    temperature: payload.temperature,
    stream,
    ...openAICompatibleReasoningParams(provider, payload.maxTokens),
  };
}

function openAIResponsesBody(provider: LlmProvider, payload: TextPayload, stream: boolean) {
  return {
    model: provider.modelName,
    instructions: payload.system,
    input: payload.user,
    max_output_tokens: payload.maxTokens,
    temperature: payload.temperature,
    stream,
    store: false,
    ...openAIResponsesReasoningParams(provider),
  };
}

function anthropicBody(provider: LlmProvider, payload: TextPayload, stream: boolean) {
  const thinking = anthropicThinking(provider, payload.maxTokens);
  return {
    model: provider.modelName,
    max_tokens: payload.maxTokens,
    temperature: thinking?.type === 'enabled' ? undefined : payload.temperature,
    stream,
    system: payload.system,
    messages: [{ role: 'user', content: payload.user }],
    ...(thinking ? { thinking } : {}),
  };
}

function geminiBody(provider: LlmProvider, payload: TextPayload) {
  return {
    systemInstruction: { parts: [{ text: payload.system }] },
    contents: [{ role: 'user', parts: [{ text: payload.user }] }],
    generationConfig: {
      maxOutputTokens: payload.maxTokens,
      temperature: payload.temperature,
      ...geminiThinkingConfig(provider, payload.maxTokens),
    },
  };
}

function openAIResponsesReasoningParams(provider: LlmProvider) {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return {};
  const normalized = normalizeOpenAIEffort(effort);
  return normalized ? { reasoning: { effort: normalized } } : {};
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
): { type: 'enabled' | 'disabled'; budget_tokens?: number } | null {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return null;
  if (effort === 'none') return { type: 'disabled' };
  const budget = thinkingBudget(effort, maxTokens - 1);
  return typeof budget === 'number' && budget >= 1024
    ? { type: 'enabled', budget_tokens: budget }
    : null;
}

function geminiThinkingConfig(provider: LlmProvider, maxTokens: number) {
  const effort = provider.reasoningEffort || 'none';
  if (effort === 'default') return {};
  if (effort === 'none') {
    return { thinkingConfig: { includeThoughts: false, thinkingBudget: 0 } };
  }
  if (effort === 'auto') {
    return { thinkingConfig: { includeThoughts: true, thinkingBudget: -1 } };
  }
  return {
    thinkingConfig: { includeThoughts: true, thinkingBudget: thinkingBudget(effort, maxTokens) },
  };
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
  return Math.min(maxTokens, Math.max(1024, Math.round(16_384 * ratio[effort])));
}

function openAIBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl);
  return /\/v\d+(?:beta)?$/.test(base) ? base : `${base}/v1`;
}

function geminiBaseUrl(baseUrl: string) {
  const base = trimSlash(baseUrl).replace(/\/v1beta$/, '');
  return `${base}/v1beta`;
}

function geminiGenerateUrl(provider: LlmProvider, stream: boolean) {
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent';
  const separator = method.includes('?') ? '&' : '?';
  return `${geminiBaseUrl(provider.baseUrl)}/models/${provider.modelName}:${method}${separator}key=${encodeURIComponent(
    provider.apiKey,
  )}`;
}

function bearerHeaders(provider: LlmProvider): Record<string, string> {
  return provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {};
}

function jsonBearerHeaders(provider: LlmProvider): Record<string, string> {
  return { 'content-type': 'application/json', ...bearerHeaders(provider) };
}

function extractResponsesText(data: {
  output_text?: string;
  output?: Array<{ content?: Array<{ text?: string; type?: string }> }>;
}) {
  if (data.output_text) return data.output_text;
  return (
    data.output
      ?.flatMap((item) => item.content || [])
      .map((item) => item.text || '')
      .join('\n') || ''
  );
}

function extractGeminiText(data: unknown) {
  const response = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

async function readSse(response: Response, onData: (data: string) => void) {
  if (!response.body) throw new Error('streaming body 为空');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const flushEvent = (event: string) => {
    const dataLines = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6));
    for (const data of dataLines) {
      if (data && data !== '[DONE]') onData(data);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    for (const event of events) flushEvent(event);
  }
  if (buffer.trim()) flushEvent(buffer);
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

function logProviderRequest(
  provider: LlmProvider,
  url: string,
  payload: TextPayload,
  stream: boolean,
) {
  logAiInfo('llm.request', {
    url,
    stream,
    type: provider.type,
    model: provider.modelName,
    providerName: provider.name,
    maxTokens: payload.maxTokens,
    temperature: payload.temperature,
    reasoningEffort: provider.reasoningEffort || 'none',
    apiKeyPreview: previewSecret(provider.apiKey),
  });
}

function logProviderResponse(
  provider: LlmProvider,
  textLength: number,
  usage?: Record<string, unknown>,
) {
  logAiInfo('llm.response', {
    type: provider.type,
    model: provider.modelName,
    providerName: provider.name,
    textLength,
    ...usage,
  });
}

function previewSecret(value: string) {
  if (!value) return '<empty>';
  if (value.length <= 8) return '<too-short>';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}
