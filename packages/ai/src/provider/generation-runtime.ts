import type { AssistantMessage } from '@earendil-works/pi-ai';
import { createModels } from '@earendil-works/pi-ai/models';
import type { LlmProvider } from '@yomitomo/shared';
import { errorMessage } from '@yomitomo/shared';
import { Effect } from 'effect';
import { logAiInfo } from '../logger';
import type { GenerateOptions, TextPayload } from './generation-runtime-types';
import { piModelRef, piProviderFor, piThinkingLevel } from './pi-provider';
import { normalizePiUsage, type NormalizedAiUsage } from './usage';

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
  return Effect.runPromise(
    generateYomitomoTextEffect(provider, payload, options),
    runOptions(options.signal),
  );
}

/** Bridges a caller's AbortSignal into the Effect fiber, which already reaches the provider request. */
export function runOptions(signal?: AbortSignal) {
  return signal ? { signal } : undefined;
}

export const generateYomitomoTextEffect = Effect.fn('Provider.generateText')(function (
  provider: LlmProvider,
  payload: TextPayload,
  options: GenerateOptions = {},
) {
  return Effect.gen(function* () {
    logProviderRequest(provider, payload);
    const message = yield* Effect.tryPromise({
      try: (signal) => completeOnce(provider, payload, signal),
      catch: (error) => new GenerationProviderError(error),
    });
    if (message.stopReason === 'error' || message.stopReason === 'aborted') {
      return yield* Effect.fail(
        new GenerationProviderError(message.errorMessage ?? message.stopReason),
      );
    }
    const text = message.content
      .flatMap((part) => (part.type === 'text' ? [part.text] : []))
      .join('')
      .trim();
    if (!text) return yield* Effect.fail(new GenerationEmptyResponseError());
    if (options.failOnMaxTokens && message.stopReason === 'length') {
      return yield* Effect.fail(new GenerationMaxTokensError(payload.maxTokens));
    }
    const usage = normalizePiUsage(message.usage);
    logProviderResponse(provider, text.length, usage);
    return { text, usage, finishReason: message.stopReason };
  });
});

function completeOnce(
  provider: LlmProvider,
  payload: TextPayload,
  signal: AbortSignal,
): Promise<AssistantMessage> {
  const task = { id: 'task', temperature: payload.temperature };
  const models = createModels();
  models.setProvider(piProviderFor(provider, task));
  const ref = piModelRef(provider, task);
  const model = models.getModel(ref.provider, ref.modelId)!;
  const level = piThinkingLevel(provider);
  const thinks = level !== undefined && level !== 'off';
  return models.completeSimple(
    model,
    {
      systemPrompt: payload.system,
      messages: [{ role: 'user', content: payload.user, timestamp: Date.now() }],
    },
    {
      ...(thinks ? { reasoning: level } : { temperature: payload.temperature }),
      maxTokens: payload.maxTokens,
      signal,
    },
  );
}

function logProviderRequest(provider: LlmProvider, payload: TextPayload) {
  logAiInfo('assistant.generation.start', {
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

function logProviderResponse(provider: LlmProvider, textLength: number, usage: NormalizedAiUsage) {
  logAiInfo('assistant.generation.finish', {
    type: provider.type,
    model: provider.modelName,
    providerName: provider.name,
    textLength,
    ...usage,
  });
}
