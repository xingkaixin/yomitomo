import { generateText, jsonSchema, Output, streamText, type JSONSchema7 } from 'ai';
import type { LlmProvider } from '@yomitomo/shared';
import { Effect } from 'effect';
import { createYomitomoLanguageModel } from './ai-sdk-provider-adapter';
import { logAiInfo } from '../logger';
import type { GenerateOptions, TextPayload } from './provider-client-types';
import { normalizeAiUsage, type NormalizedAiUsage } from './usage';

export type YomitomoTextGenerationResult = {
  text: string;
  usage: NormalizedAiUsage;
  finishReason?: string;
};

type GenerationRuntimeError =
  | GenerationEmptyResponseError
  | GenerationMaxTokensError
  | GenerationProviderError;

class GenerationProviderError extends Error {
  readonly _tag = 'GenerationProviderError';

  constructor(cause: unknown) {
    super(errorMessage(cause));
  }
}

class GenerationEmptyResponseError extends Error {
  readonly _tag = 'GenerationEmptyResponseError';

  constructor() {
    super('模型返回为空');
  }
}

class GenerationMaxTokensError extends Error {
  readonly _tag = 'GenerationMaxTokensError';

  constructor(maxTokens: number) {
    super(`模型输出达到 max_tokens=${maxTokens}，结构化 JSON 可能已被截断`);
  }
}

export async function generateYomitomoText(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions = {},
): Promise<YomitomoTextGenerationResult> {
  return Effect.runPromise(generateYomitomoTextEffect(provider, payload, options));
}

export async function streamYomitomoText(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
): Promise<YomitomoTextGenerationResult> {
  return Effect.runPromise(streamYomitomoTextEffect(provider, payload, onDelta));
}

function generateYomitomoTextEffect(
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions,
): Effect.Effect<YomitomoTextGenerationResult, GenerationRuntimeError> {
  return Effect.gen(function* () {
    const adapter = createYomitomoLanguageModel(provider);
    logProviderRequest(provider, payload, false);
    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
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
        }),
      catch: (error) => new GenerationProviderError(error),
    });
    const text = yield* structuredTextOrFallbackEffect(
      result,
      Boolean(payload.responseSchema),
    ).pipe(Effect.map((value) => value.trim()));
    if (!text) return yield* Effect.fail(new GenerationEmptyResponseError());
    if (options.failOnMaxTokens && result.finishReason === 'length') {
      return yield* Effect.fail(new GenerationMaxTokensError(payload.maxTokens));
    }
    const usage = normalizeAiUsage(result.usage);
    logProviderResponse(provider, text.length, usage);
    return { text, usage, finishReason: result.finishReason };
  });
}

function streamYomitomoTextEffect(
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
): Effect.Effect<YomitomoTextGenerationResult, GenerationRuntimeError> {
  return Effect.gen(function* () {
    const adapter = createYomitomoLanguageModel(provider);
    logProviderRequest(provider, payload, true);
    const result = yield* Effect.try({
      try: () =>
        streamText({
          model: adapter.model,
          system: payload.system,
          prompt: payload.user,
          maxOutputTokens: payload.maxTokens,
          temperature: payload.temperature,
          providerOptions: adapter.providerOptions,
        }),
      catch: (error) => new GenerationProviderError(error),
    });
    const text = yield* consumeTextStreamEffect(result.textStream, onDelta);
    const usage = normalizeAiUsage(yield* promiseEffect(result.usage));
    const finishReason = yield* promiseEffect(result.finishReason);
    logProviderResponse(provider, text.length, usage);
    return { text, usage, finishReason };
  });
}

function consumeTextStreamEffect(
  textStream: AsyncIterable<string>,
  onDelta: (delta: string) => void,
) {
  return Effect.tryPromise({
    try: async () => {
      let text = '';
      for await (const delta of textStream) {
        text += delta;
        onDelta(delta);
      }
      return text;
    },
    catch: (error) => new GenerationProviderError(error),
  });
}

function promiseEffect<T>(promise: PromiseLike<T>) {
  return Effect.tryPromise({
    try: () => Promise.resolve(promise),
    catch: (error) => new GenerationProviderError(error),
  });
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

function structuredTextOrFallbackEffect(
  result: Awaited<ReturnType<typeof generateText>>,
  structuredOutputRequested: boolean,
) {
  return Effect.try({
    try: () => structuredTextOrFallback(result, structuredOutputRequested),
    catch: (error) => new GenerationProviderError(error),
  });
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
