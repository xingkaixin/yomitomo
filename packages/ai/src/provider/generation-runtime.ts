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

class GenerationProviderError extends Error {
  readonly _tag = 'GenerationProviderError';

  constructor(cause: unknown) {
    super(errorMessage(cause));
  }
}

class GenerationEmptyResponseError extends Error {
  readonly _tag = 'GenerationEmptyResponseError';

  constructor() {
    super('Provider returned an empty response');
  }
}

class GenerationMaxTokensError extends Error {
  readonly _tag = 'GenerationMaxTokensError';

  constructor(maxTokens: number) {
    super(`Provider output reached max_tokens=${maxTokens}; structured JSON may be truncated`);
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

export const generateYomitomoTextEffect = Effect.fn('Provider.generateText')(function (
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions,
) {
  return Effect.gen(function* () {
    const adapter = createYomitomoLanguageModel(provider);
    logProviderRequest(provider, payload, false);
    const result = yield* Effect.tryPromise({
      try: (signal) =>
        generateText({
          model: adapter.model,
          system: payload.system,
          prompt: payload.user,
          maxOutputTokens: payload.maxTokens,
          temperature: payload.temperature,
          providerOptions: adapter.providerOptions,
          abortSignal: signal,
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
});

export const streamYomitomoTextEffect = Effect.fn('Provider.streamText')(function (
  provider: LlmProvider,
  payload: TextPayload,
  onDelta: (delta: string) => void,
) {
  return Effect.gen(function* () {
    const adapter = createYomitomoLanguageModel(provider);
    logProviderRequest(provider, payload, true);
    const generation = yield* Effect.tryPromise({
      try: async (signal) => {
        const result = streamText({
          model: adapter.model,
          system: payload.system,
          prompt: payload.user,
          maxOutputTokens: payload.maxTokens,
          temperature: payload.temperature,
          providerOptions: adapter.providerOptions,
          abortSignal: signal,
        });
        let text = '';
        for await (const delta of result.textStream) {
          text += delta;
          onDelta(delta);
        }
        const [usage, finishReason] = await Promise.all([result.usage, result.finishReason]);
        return { text, usage: normalizeAiUsage(usage), finishReason };
      },
      catch: (error) => new GenerationProviderError(error),
    });
    logProviderResponse(provider, generation.text.length, generation.usage);
    return generation;
  });
});

function logProviderRequest(provider: LlmProvider, payload: TextPayload, stream: boolean) {
  logAiInfo('assistant.generation.start', {
    stream,
    type: provider.type,
    model: provider.modelName,
    providerId: provider.id,
    providerName: provider.name,
    maxTokens: payload.maxTokens,
    temperature: payload.temperature,
    reasoningEffort: provider.reasoningEffort || 'none',
    hasApiKey: Boolean(provider.apiKey),
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
