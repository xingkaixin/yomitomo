import type { LlmProvider, ProviderModel } from '@yomitomo/shared';
import { providerPresets } from '@yomitomo/shared';
import { Effect, Schema } from 'effect';
import { normalizeAnthropicError } from './budget';
import { geminiBaseUrl, openAIBaseUrl } from './ai-sdk-provider-adapter';

const defaultProviderPreset = providerPresets.find((preset) => preset.id === 'deepseek');

const openAIModelListResponseSchema = Schema.Struct({
  data: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.optionalKey(Schema.String),
        name: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
});

const anthropicModelListResponseSchema = Schema.Struct({
  data: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        id: Schema.optionalKey(Schema.String),
        display_name: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
});

const geminiModelListResponseSchema = Schema.Struct({
  models: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        name: Schema.optionalKey(Schema.String),
        displayName: Schema.optionalKey(Schema.String),
      }),
    ),
  ),
});

type ProviderClientError = ProviderHttpError | ProviderNetworkError | ProviderResponseDecodeError;

class ProviderNetworkError extends Error {
  readonly _tag = 'ProviderNetworkError';

  constructor(cause: unknown) {
    super(`Provider request failed: ${errorMessage(cause)}`);
  }
}

class ProviderHttpError extends Error {
  readonly _tag = 'ProviderHttpError';
}

class ProviderResponseDecodeError extends Error {
  readonly _tag = 'ProviderResponseDecodeError';

  constructor(cause: unknown) {
    super(`Provider response parse failed: ${errorMessage(cause)}`);
  }
}

export async function listProviderModels(provider: Partial<LlmProvider>): Promise<ProviderModel[]> {
  return Effect.runPromise(listProviderModelsEffect(provider));
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

export const listProviderModelsEffect = Effect.fn('Provider.listModels')(function* (
  input: Partial<LlmProvider>,
) {
  const provider = normalizeProvider(input);
  if (provider.type === 'gemini') return yield* listGeminiModelsEffect(provider);
  if (provider.type === 'anthropic') return yield* listAnthropicModelsEffect(provider);
  return yield* listOpenAICompatibleModelsEffect(provider);
});

function listOpenAICompatibleModelsEffect(
  provider: LlmProvider,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(`${openAIBaseUrl(provider.baseUrl)}/models`, {
      headers: bearerHeaders(provider),
    });
    if (!response.ok) {
      const message = yield* modelListErrorEffect(response);
      return yield* Effect.fail(new ProviderHttpError(message));
    }
    const data = yield* responseJsonEffect(response, openAIModelListResponseSchema);
    return modelList(
      data.data?.map((model) => ({
        id: model.id || '',
        name: model.name || model.id || '',
      })),
      provider,
    );
  });
}

function listAnthropicModelsEffect(
  provider: LlmProvider,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(`${trimSlash(provider.baseUrl)}/v1/models`, {
      headers: {
        'anthropic-version': '2023-06-01',
        'x-api-key': provider.apiKey,
      },
    });
    if (!response.ok) {
      const text = yield* responseTextEffect(response);
      return yield* Effect.fail(
        new ProviderHttpError(normalizeAnthropicError(response.status, text)),
      );
    }
    const data = yield* responseJsonEffect(response, anthropicModelListResponseSchema);
    return modelList(
      data.data?.map((model) => ({
        id: model.id || '',
        name: model.display_name || model.id || '',
      })),
      provider,
    );
  });
}

function listGeminiModelsEffect(
  provider: LlmProvider,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  const url = `${geminiBaseUrl(provider.baseUrl)}/models?key=${encodeURIComponent(provider.apiKey)}`;
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(url);
    if (!response.ok) {
      const message = yield* modelListErrorEffect(response);
      return yield* Effect.fail(new ProviderHttpError(message));
    }
    const data = yield* responseJsonEffect(response, geminiModelListResponseSchema);
    return modelList(
      data.models?.map((model) => {
        const id = (model.name || '').replace(/^models\//, '');
        return { id, name: model.displayName || id };
      }),
      provider,
    );
  });
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

function fetchProviderModels(
  url: string,
  init?: RequestInit,
): Effect.Effect<Response, ProviderNetworkError> {
  return Effect.tryPromise({
    try: (signal) => fetch(url, { ...init, signal }),
    catch: (error) => new ProviderNetworkError(error),
  });
}

function responseJsonEffect<S extends Schema.Constraint>(response: Response, schema: S) {
  return Effect.tryPromise({
    try: () => response.json(),
    catch: (error) => error,
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) => new ProviderResponseDecodeError(error)),
  );
}

function responseTextEffect(response: Response) {
  return Effect.tryPromise({
    try: () => response.text(),
    catch: (error) => new ProviderResponseDecodeError(error),
  });
}

function modelListErrorEffect(response: Response) {
  return Effect.gen(function* () {
    const text = yield* responseTextEffect(response);
    return `Provider request failed: ${response.status} ${text.slice(0, 400)}`;
  });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}
