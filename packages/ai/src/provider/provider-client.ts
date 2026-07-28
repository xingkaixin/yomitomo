import type { LlmProvider, ProviderModel } from '@yomitomo/shared';
import { errorMessage, providerPresets } from '@yomitomo/shared';
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

type ProviderClientError =
  | ProviderHttpError
  | ProviderNetworkError
  | ProviderResponseDecodeError
  | ProviderResponseTooLargeError
  | ProviderTimeoutError;

export type ProviderModelListOptions = {
  timeoutMs?: number;
  maxResponseBytes?: number;
};

// A custom base URL may point at an endpoint that never finishes a response, so model
// enumeration carries its own deadline and byte budget instead of trusting the peer.
const PROVIDER_MODEL_LIST_TIMEOUT_MS = 20_000;
const PROVIDER_MODEL_LIST_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const PROVIDER_MODEL_LIST_MAX_ERROR_BYTES = 64 * 1024;
const PROVIDER_MODEL_LIST_ERROR_PREVIEW_CHARS = 400;

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

class ProviderTimeoutError extends Error {
  readonly _tag = 'ProviderTimeoutError';

  constructor(timeoutMs: number) {
    super(`Provider request timed out after ${timeoutMs}ms`);
  }
}

class ProviderResponseTooLargeError extends Error {
  readonly _tag = 'ProviderResponseTooLargeError';

  constructor(limitBytes: number) {
    super(`Provider response exceeded ${limitBytes} bytes`);
  }
}

export async function listProviderModels(
  provider: Partial<LlmProvider>,
  options?: ProviderModelListOptions,
): Promise<ProviderModel[]> {
  return Effect.runPromise(listProviderModelsEffect(provider, options));
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
  options?: ProviderModelListOptions,
) {
  const provider = normalizeProvider(input);
  const budget = modelListBudget(options);
  if (provider.type === 'gemini') return yield* listGeminiModelsEffect(provider, budget);
  if (provider.type === 'anthropic') return yield* listAnthropicModelsEffect(provider, budget);
  return yield* listOpenAICompatibleModelsEffect(provider, budget);
});

function listOpenAICompatibleModelsEffect(
  provider: LlmProvider,
  budget: ProviderModelListBudget,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(
      `${openAIBaseUrl(provider.baseUrl)}/models`,
      budget,
      {
        headers: bearerHeaders(provider),
      },
    );
    if (!response.ok) {
      const message = yield* modelListErrorEffect(response, budget);
      return yield* Effect.fail(new ProviderHttpError(message));
    }
    const data = yield* responseJsonEffect(response, openAIModelListResponseSchema, budget);
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
  budget: ProviderModelListBudget,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(
      `${trimSlash(provider.baseUrl)}/v1/models`,
      budget,
      {
        headers: {
          'anthropic-version': '2023-06-01',
          'x-api-key': provider.apiKey,
        },
      },
    );
    if (!response.ok) {
      const text = yield* responseTextEffect(response, budget);
      return yield* Effect.fail(
        new ProviderHttpError(normalizeAnthropicError(response.status, text)),
      );
    }
    const data = yield* responseJsonEffect(response, anthropicModelListResponseSchema, budget);
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
  budget: ProviderModelListBudget,
): Effect.Effect<ProviderModel[], ProviderClientError> {
  const url = `${geminiBaseUrl(provider.baseUrl)}/models?key=${encodeURIComponent(provider.apiKey)}`;
  return Effect.gen(function* () {
    const response = yield* fetchProviderModels(url, budget);
    if (!response.ok) {
      const message = yield* modelListErrorEffect(response, budget);
      return yield* Effect.fail(new ProviderHttpError(message));
    }
    const data = yield* responseJsonEffect(response, geminiModelListResponseSchema, budget);
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
  budget: ProviderModelListBudget,
  init?: RequestInit,
): Effect.Effect<Response, ProviderNetworkError | ProviderTimeoutError> {
  return Effect.tryPromise({
    try: (signal) =>
      fetch(url, {
        ...init,
        signal: AbortSignal.any([signal, AbortSignal.timeout(budget.timeoutMs)]),
      }),
    catch: (error) =>
      isTimeoutAbort(error)
        ? new ProviderTimeoutError(budget.timeoutMs)
        : new ProviderNetworkError(error),
  });
}

function responseJsonEffect<S extends Schema.Constraint>(
  response: Response,
  schema: S,
  budget: ProviderModelListBudget,
) {
  return readBoundedResponseText(response, budget.maxResponseBytes, 'fail').pipe(
    Effect.flatMap((text) =>
      Effect.try({ try: () => JSON.parse(text) as unknown, catch: (error) => error }),
    ),
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError((error) =>
      error instanceof ProviderResponseTooLargeError || error instanceof ProviderTimeoutError
        ? error
        : new ProviderResponseDecodeError(error),
    ),
  );
}

function responseTextEffect(response: Response, budget: ProviderModelListBudget) {
  return readBoundedResponseText(response, budget.maxErrorBytes, 'truncate');
}

function modelListErrorEffect(response: Response, budget: ProviderModelListBudget) {
  return Effect.gen(function* () {
    const text = yield* responseTextEffect(response, budget);
    return `Provider request failed: ${response.status} ${text.slice(0, PROVIDER_MODEL_LIST_ERROR_PREVIEW_CHARS)}`;
  });
}

type ProviderModelListBudget = {
  timeoutMs: number;
  maxResponseBytes: number;
  maxErrorBytes: number;
};

function modelListBudget(options: ProviderModelListOptions = {}): ProviderModelListBudget {
  return {
    timeoutMs: Math.min(
      options.timeoutMs || PROVIDER_MODEL_LIST_TIMEOUT_MS,
      PROVIDER_MODEL_LIST_TIMEOUT_MS,
    ),
    maxResponseBytes: Math.min(
      options.maxResponseBytes || PROVIDER_MODEL_LIST_MAX_RESPONSE_BYTES,
      PROVIDER_MODEL_LIST_MAX_RESPONSE_BYTES,
    ),
    maxErrorBytes: Math.min(
      options.maxResponseBytes || PROVIDER_MODEL_LIST_MAX_ERROR_BYTES,
      PROVIDER_MODEL_LIST_MAX_ERROR_BYTES,
    ),
  };
}

/**
 * Reads a response under a byte budget: an oversized `Content-Length` is refused before
 * any body arrives, and the stream is cancelled as soon as the running total passes the
 * limit. `truncate` keeps whatever fit, for error previews that must not mask the status.
 */
function readBoundedResponseText(
  response: Response,
  limitBytes: number,
  onExceed: 'fail' | 'truncate',
): Effect.Effect<string, ProviderResponseTooLargeError | ProviderResponseDecodeError> {
  return Effect.tryPromise({
    try: async () => {
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > limitBytes) {
        await response.body?.cancel();
        if (onExceed === 'fail') throw new ProviderResponseTooLargeError(limitBytes);
        return '';
      }
      if (!response.body) return await response.text();
      return await readBoundedStream(response.body, limitBytes, onExceed);
    },
    catch: (error) =>
      error instanceof ProviderResponseTooLargeError
        ? error
        : new ProviderResponseDecodeError(error),
  });
}

async function readBoundedStream(
  body: ReadableStream<Uint8Array>,
  limitBytes: number,
  onExceed: 'fail' | 'truncate',
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      if (onExceed === 'fail') throw new ProviderResponseTooLargeError(limitBytes);
      return text;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function isTimeoutAbort(error: unknown) {
  return error instanceof Error && error.name === 'TimeoutError';
}

function trimSlash(value: string) {
  return value.replace(/\/+$/, '');
}
