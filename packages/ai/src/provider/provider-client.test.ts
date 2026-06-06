import type { LlmProvider } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callProviderText, listProviderModels, streamProviderText } from './provider-client';

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

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/v1/models', {
      headers: { Authorization: 'Bearer key' },
    });
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
});

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
