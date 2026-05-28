import { generateText, jsonSchema, Output, streamText, type JSONSchema7 } from 'ai';
import type { LlmProvider } from '@yomitomo/shared';
import { createYomitomoLanguageModel } from './ai-sdk-provider-adapter';
import { logAiInfo } from './logger';
import type { GenerateOptions, TextPayload } from './provider-client';
import { normalizeAiUsage, type NormalizedAiUsage } from './usage';

export type YomitomoTextGenerationResult = {
  text: string;
  usage: NormalizedAiUsage;
  finishReason?: string;
};

export async function generateYomitomoText(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions = {},
): Promise<YomitomoTextGenerationResult> {
  const adapter = createYomitomoLanguageModel(provider);
  logProviderRequest(provider, payload, false);
  const result = await generateText({
    model: adapter.model,
    system: payload.system,
    prompt: payload.user,
    maxOutputTokens: payload.maxTokens,
    temperature: payload.temperature,
    providerOptions: adapter.providerOptions,
    output:
      payload.responseSchema && adapter.supportsStructuredOutput
        ? Output.object({
            name: payload.responseSchema.name,
            schema: jsonSchema(payload.responseSchema.schema as JSONSchema7),
          })
        : undefined,
  });
  const text = structuredTextOrFallback(result, Boolean(payload.responseSchema)).trim();
  if (!text) throw new Error('模型返回为空');
  if (options.failOnMaxTokens && result.finishReason === 'length') {
    throw new Error(`模型输出达到 max_tokens=${payload.maxTokens}，结构化 JSON 可能已被截断`);
  }
  const usage = normalizeAiUsage(result.usage);
  logProviderResponse(provider, text.length, usage);
  return { text, usage, finishReason: result.finishReason };
}

export async function streamYomitomoText(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
): Promise<YomitomoTextGenerationResult> {
  const adapter = createYomitomoLanguageModel(provider);
  logProviderRequest(provider, payload, true);
  const result = streamText({
    model: adapter.model,
    system: payload.system,
    prompt: payload.user,
    maxOutputTokens: payload.maxTokens,
    temperature: payload.temperature,
    providerOptions: adapter.providerOptions,
  });
  let text = '';
  for await (const delta of result.textStream) {
    text += delta;
    onDelta(delta);
  }
  const usage = normalizeAiUsage(await result.usage);
  const finishReason = await result.finishReason;
  logProviderResponse(provider, text.length, usage);
  return { text, usage, finishReason };
}

function logProviderRequest(provider: LlmProvider, payload: TextPayload, stream: boolean) {
  logAiInfo('assistant.generation.start', {
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

function structuredTextOrFallback(
  result: Awaited<ReturnType<typeof generateText>>,
  structuredOutputRequested: boolean,
) {
  if (!structuredOutputRequested) return result.text;
  try {
    return result.output ? JSON.stringify(result.output) : result.text;
  } catch (error) {
    if (result.text.trim()) return result.text;
    throw error;
  }
}

function logProviderResponse(provider: LlmProvider, textLength: number, usage: NormalizedAiUsage) {
  logAiInfo('assistant.generation.finish', {
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
