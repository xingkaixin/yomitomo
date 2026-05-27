import type { LlmProvider } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { callProviderText, streamProviderText } from './provider-client';

function requestBodyText(value: unknown) {
  return typeof value === 'string' ? value : '';
}

describe('streamProviderText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the final SSE event without a trailing blank line', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":"tail"}}]}'),
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }), {
        status: 200,
      }),
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
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ output_text: '{"ok":true}' }), { status: 200 }),
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
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
        }),
        { status: 200 },
      ),
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
    expect(body.generationConfig?.responseSchema).toEqual(testResponseSchema().schema);
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
