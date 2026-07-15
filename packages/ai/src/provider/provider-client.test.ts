import type { LlmProvider } from '@yomitomo/shared';
import { Cause, Effect, Exit, Fiber } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setAiLogger } from '../logger';
import {
  callProviderText,
  callProviderTextEffect,
  listProviderModels,
  listProviderModelsEffect,
  streamProviderText,
} from './provider-client';

function requestBodyText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

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

  it('aborts the model-list request when its Effect fiber is interrupted', async () => {
    const started = pendingFetch();
    const fiber = Effect.runFork(listProviderModelsEffect(provider()));

    const signal = await started;
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(signal.aborted).toBe(true);
  });
});

describe('streamProviderText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams text deltas through AI SDK', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"index":0,"delta":{"content":"tail"},"finish_reason":null}]}\n\n',
              ),
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
              ),
            );
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );

    let text = '';
    await streamProviderText(provider(), payload(), (delta) => {
      text += delta;
    });

    expect(text).toBe('tail');
  });
});

describe('callProviderText response schema', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes JSON schema response_format to OpenAI chat providers', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ choices: [{ index: 0, message: { content: '{"ok":true}' } }] }),
      );

    await callProviderText(
      {
        ...provider(),
        presetId: 'openai',
        baseUrl: 'https://api.openai.com',
      },
      { ...payload(), responseSchema: testResponseSchema() },
    );

    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      response_format?: unknown;
    };
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'test_schema',
        strict: true,
        schema: testResponseSchema().schema,
      },
    });
  });

  it('passes JSON schema text format to OpenAI responses providers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        id: 'response-1',
        created_at: 0,
        model: 'model',
        output: [
          {
            id: 'message-1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"ok":true}',
                annotations: [],
              },
            ],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );

    await callProviderText(
      {
        ...provider(),
        type: 'openai-responses',
        presetId: 'openai',
        baseUrl: 'https://api.openai.com',
      },
      { ...payload(), responseSchema: testResponseSchema() },
    );

    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      text?: unknown;
    };
    expect(body.text).toEqual({
      format: {
        type: 'json_schema',
        name: 'test_schema',
        strict: true,
        schema: testResponseSchema().schema,
      },
    });
  });

  it('passes responseSchema to Gemini generation config', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      }),
    );

    await callProviderText(
      {
        ...provider(),
        type: 'gemini',
        presetId: 'gemini',
        baseUrl: 'https://generativelanguage.googleapis.com',
      },
      { ...payload(), responseSchema: testResponseSchema() },
    );

    const body = JSON.parse(requestBodyText(fetchMock.mock.calls[0]?.[1]?.body)) as {
      generationConfig?: Record<string, unknown>;
    };
    expect(body.generationConfig?.responseMimeType).toBe('application/json');
    expect(body.generationConfig?.responseSchema).toMatchObject({
      required: ['ok'],
      properties: testResponseSchema().schema.properties,
    });
  });

  it('rejects with the empty model response error from the Effect boundary', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ index: 0, message: { content: '' } }] }),
    );

    await expect(callProviderText(provider(), payload())).rejects.toThrow(
      'Provider returned an empty response',
    );
  });

  it('preserves generation errors through provider Effect composition', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ index: 0, message: { content: '' } }] }),
    );

    const exit = await Effect.runPromiseExit(callProviderTextEffect(provider(), payload()));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;

    expect(Cause.hasFails(exit.cause)).toBe(true);
    expect(Cause.hasDies(exit.cause)).toBe(false);
    expect(Cause.squash(exit.cause)).toMatchObject({
      _tag: 'GenerationEmptyResponseError',
    });
  });

  it('aborts generation when its Effect fiber is interrupted', async () => {
    const started = pendingFetch();
    const fiber = Effect.runFork(callProviderTextEffect(provider(), payload()));

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

describe('provider generation logging', () => {
  afterEach(() => {
    setAiLogger({});
    vi.restoreAllMocks();
  });

  it('does not expose API key-derived fields in generation logs', async () => {
    const apiKey = 'rd819-sensitive-credential';
    const startEvents = captureGenerationStarts();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ index: 0, message: { content: 'ok' } }] }),
    );

    await callProviderText({ ...provider(), apiKey }, payload());

    expect(startEvents).toHaveLength(1);
    expect(startEvents[0]).toMatchObject({
      providerId: 'provider-1',
      hasApiKey: true,
    });
    expectLogToExcludeCredential(startEvents[0], apiKey);
  });

  it('does not expose API key fragments when generation fails', async () => {
    const apiKey = 'rd819-failing-credential';
    const startEvents = captureGenerationStarts();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    await expect(callProviderText({ ...provider(), apiKey }, payload())).rejects.toThrow();

    expect(startEvents).toHaveLength(1);
    expectLogToExcludeCredential(startEvents[0], apiKey);
  });

  it('records when an API key is not configured', async () => {
    const startEvents = captureGenerationStarts();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({ choices: [{ index: 0, message: { content: 'ok' } }] }),
    );

    await callProviderText({ ...provider(), apiKey: '' }, payload());

    expect(startEvents[0]).toMatchObject({ hasApiKey: false });
  });
});

function captureGenerationStarts() {
  const events: Array<Record<string, unknown>> = [];
  setAiLogger({
    info(event, data) {
      if (event === 'assistant.generation.start' && data) events.push(data);
    },
  });
  return events;
}

function expectLogToExcludeCredential(
  log: Record<string, unknown> | undefined,
  credential: string,
) {
  const serializedLog = JSON.stringify(log);
  expect(serializedLog).not.toContain(credential);
  expect(serializedLog).not.toContain(credential.slice(0, 4));
  expect(serializedLog).not.toContain(credential.slice(-4));
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

function payload() {
  return {
    system: 'system',
    user: 'user',
    maxTokens: 128,
  };
}

function testResponseSchema() {
  return {
    name: 'test_schema',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
      },
    },
  };
}
