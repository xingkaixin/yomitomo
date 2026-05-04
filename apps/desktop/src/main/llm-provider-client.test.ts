import type { LlmProvider } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./logger', () => ({ logInfo: vi.fn() }));

import { streamProviderText } from './llm-provider-client';

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
