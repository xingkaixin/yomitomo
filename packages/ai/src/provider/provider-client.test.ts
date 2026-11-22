import type { LlmProvider } from '@yomitomo/shared';
import { Cause, Effect, Exit } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { providerThinkingCapabilities } from './pi-provider';
import { listProviderModels, listProviderModelsEffect } from './provider-client';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe('listProviderModels', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['https://proxy.example.com', 'https://proxy.example.com/v1/'])(
    'sends Anthropic model list requests under /v1 for %s',
    async (baseUrl) => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ data: [] }));

      await listProviderModels(providerFor('anthropic', 'anthropic', baseUrl));

      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://proxy.example.com/v1/models');
    },
  );

  it('parses ChatGPT Sign-in model catalogs, keeps list-visible models, and records reasoning levels', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        models: [
          {
            slug: 'gpt-6.2-sol',
            display_name: 'GPT-6.2 Sol',
            visibility: 'list',
            supported_reasoning_levels: [
              { effort: 'low' },
              { effort: 'medium' },
              { effort: 'high' },
              { effort: 'xhigh' },
              { effort: 'max' },
            ],
          },
          { slug: 'internal-only', display_name: 'Internal', visibility: 'hide' },
          {
            slug: 'gpt-custom-flex',
            display_name: 'GPT Custom Flex',
            visibility: 'list',
            supported_reasoning_levels: ['none', 'medium', 'high'],
          },
        ],
      }),
    );

    const models = await listProviderModels(
      providerFor('openai-responses', 'chatgpt', 'https://api.openai.com/v1'),
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models');
    expect(models).toEqual([
      {
        id: 'gpt-6.2-sol',
        name: 'GPT-6.2 Sol',
        supportedReasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
      },
      {
        id: 'gpt-custom-flex',
        name: 'GPT Custom Flex',
        supportedReasoningEfforts: ['none', 'medium', 'high'],
      },
    ]);
    expect(
      providerThinkingCapabilities({
        presetId: 'chatgpt',
        type: 'openai-responses',
        modelName: 'gpt-custom-flex',
      }),
    ).toEqual({
      supportedEfforts: ['none', 'medium', 'high'],
      defaultEffort: 'none',
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
