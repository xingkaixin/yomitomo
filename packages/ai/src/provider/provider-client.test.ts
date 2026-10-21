import type { LlmProvider } from '@yomitomo/shared';
import { Cause, Effect, Exit, Fiber } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listProviderModels, listProviderModelsEffect } from './provider-client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('listProviderModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists and dedupes OpenAI compatible models', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        data: [
          { id: 'model-a', name: 'Model A' },
          { id: 'model-a', name: 'Duplicate' },
          { id: '', name: 'Blank' },
        ],
      }),
    );

    await expect(listProviderModels(provider())).resolves.toEqual([
      { id: 'model-a', name: 'Model A' },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer key' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('rejects with a typed network error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(listProviderModels(provider())).rejects.toThrow(
      'Provider request failed: offline',
    );
  });

  it('rejects with provider HTTP error details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('bad credentials', { status: 401 }),
    );

    await expect(listProviderModels(provider())).rejects.toThrow(
      'Provider request failed: 401 bad credentials',
    );
  });

  it('normalizes Anthropic context errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('input context length exceeds maximum tokens', { status: 400 }),
    );

    await expect(
      listProviderModels({
        ...provider(),
        type: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
      }),
    ).rejects.toThrow(
      'Model context limit exceeded. Use a larger-context model, narrow the article scope, or reduce annotation evidence and try again.',
    );
  });

  it.each(['https://proxy.example.com', 'https://proxy.example.com/v1/'])(
    'sends Anthropic model list requests under /v1 for %s',
    async (baseUrl) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [] }));

      await listProviderModels(providerFor('anthropic', 'anthropic', baseUrl));

      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://proxy.example.com/v1/models');
    },
  );

  it('rejects with a response decode error when JSON parsing fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(listProviderModels(provider())).rejects.toThrow('Provider response parse failed');
  });

  it.each([
    {
      name: 'OpenAI-compatible object list',
      target: provider(),
      body: { data: {} },
    },
    {
      name: 'Anthropic string list',
      target: providerFor('anthropic', 'anthropic', 'https://api.anthropic.com'),
      body: { data: 'invalid' },
    },
    {
      name: 'Gemini null list',
      target: providerFor('gemini', 'gemini', 'https://generativelanguage.googleapis.com'),
      body: { models: null },
    },
  ])('rejects malformed $name payloads with a response decode error', async ({ target, body }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body));

    await expect(listProviderModels(target)).rejects.toThrow('Provider response parse failed');
  });

  it.each([
    {
      name: 'OpenAI-compatible missing list',
      target: providerFor('openai-chat', 'openai', 'https://api.openai.com'),
      body: {},
    },
    {
      name: 'Anthropic empty list',
      target: providerFor('anthropic', 'anthropic', 'https://api.anthropic.com'),
      body: { data: [] },
    },
    {
      name: 'Gemini empty list',
      target: providerFor('gemini', 'gemini', 'https://generativelanguage.googleapis.com'),
      body: { models: [] },
    },
  ])('uses the preset fallback for a valid $name response', async ({ target, body }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(body));

    await expect(listProviderModels(target)).resolves.not.toHaveLength(0);
  });

  it('keeps malformed model payloads in the typed decode failure channel', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [null] }));

    const exit = await Effect.runPromiseExit(listProviderModelsEffect(provider()));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;

    expect(Cause.hasFails(exit.cause)).toBe(true);
    expect(Cause.hasDies(exit.cause)).toBe(false);
    expect(Cause.squash(exit.cause)).toMatchObject({
      _tag: 'ProviderResponseDecodeError',
    });
  });

  it('aborts a model-list request that outlives its deadline', async () => {
    const started = pendingFetch();

    const exit = await Effect.runPromiseExit(
      listProviderModelsEffect(provider(), { timeoutMs: 5 }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.squash(exit.cause)).toMatchObject({ _tag: 'ProviderTimeoutError' });
    expect((await started).aborted).toBe(true);
  });

  it('accepts a slow response that still arrives before the deadline', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Promise<Response>((resolve) => {
          setTimeout(() => resolve(jsonResponse({ data: [{ id: 'slow-model' }] })), 5);
        }),
    );

    await expect(listProviderModels(provider(), { timeoutMs: 5_000 })).resolves.toMatchObject([
      { id: 'slow-model' },
    ]);
  });

  it('refuses a response whose declared length exceeds the budget', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'model' }] }), {
        headers: { 'content-length': String(4096) },
      }),
    );

    const exit = await Effect.runPromiseExit(
      listProviderModelsEffect(provider(), { maxResponseBytes: 1024 }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.squash(exit.cause)).toMatchObject({ _tag: 'ProviderResponseTooLargeError' });
  });

  it('cancels a streamed response once it passes the budget', async () => {
    let cancelled = false;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new TextEncoder().encode('x'.repeat(256)));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );

    const exit = await Effect.runPromiseExit(
      listProviderModelsEffect(provider(), { maxResponseBytes: 1024 }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.squash(exit.cause)).toMatchObject({ _tag: 'ProviderResponseTooLargeError' });
    expect(cancelled).toBe(true);
  });

  it('reads a payload that fills the budget exactly', async () => {
    const body = JSON.stringify({ data: [{ id: 'model-at-limit' }] });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body));

    await expect(
      listProviderModels(provider(), {
        maxResponseBytes: new TextEncoder().encode(body).byteLength,
      }),
    ).resolves.toMatchObject([{ id: 'model-at-limit' }]);
  });

  it('truncates an oversized error body instead of masking the status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('detail '.repeat(10_000), { status: 500 }),
    );

    const exit = await Effect.runPromiseExit(
      listProviderModelsEffect(provider(), { maxResponseBytes: 1024 }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    const failure = Cause.squash(exit.cause);
    expect(failure).toMatchObject({ _tag: 'ProviderHttpError' });
    expect((failure as Error).message).toContain('500');
  });

  it('aborts the model-list request when its Effect fiber is interrupted', async () => {
    const started = pendingFetch();
    const fiber = Effect.runFork(listProviderModelsEffect(provider()));

    const signal = await started;
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(signal.aborted).toBe(true);
  });
});

function pendingFetch() {
  const started = createDeferred<AbortSignal>();
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error('Expected fetch AbortSignal');
    started.resolve(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  return started.promise;
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: (value: T) => resolvePromise?.(value) };
}

function provider(): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
    modelName: 'model',
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function providerFor(
  type: LlmProvider['type'],
  presetId: NonNullable<LlmProvider['presetId']>,
  baseUrl: string,
): LlmProvider {
  return { ...provider(), type, presetId, baseUrl };
}
