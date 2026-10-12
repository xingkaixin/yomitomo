import type { LlmProvider } from '@yomitomo/shared';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { expect, it, vi } from 'vitest';
import { streamYomitomoText } from './generation-runtime';

type ModelStreamPart =
  Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part>
    ? Part
    : never;

const adapter = vi.hoisted(() => ({ model: undefined as MockLanguageModelV4 | undefined }));

vi.mock('./ai-sdk-provider-adapter', () => ({
  createYomitomoLanguageModel: () => ({ model: adapter.model, providerOptions: {} }),
}));

const provider: LlmProvider = {
  id: 'provider_1',
  name: 'Provider',
  type: 'openai-chat',
  baseUrl: 'https://example.test',
  apiKey: 'key',
  modelName: 'model',
  createdAt: '2026-05-26T00:00:00.000Z',
  updatedAt: '2026-05-26T00:00:00.000Z',
};

it('fails a stream that reports a provider error after partial text', async () => {
  adapter.model = new MockLanguageModelV4({
    doStream: {
      stream: convertArrayToReadableStream<ModelStreamPart>([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'partial ' },
        { type: 'error', error: { message: 'Overloaded', type: 'overloaded_error' } },
        {
          type: 'finish',
          finishReason: { unified: 'error', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ]),
    },
  });
  const deltas: string[] = [];

  await expect(
    streamYomitomoText(provider, { system: 'system', user: 'user', maxTokens: 100 }, (delta) =>
      deltas.push(delta),
    ),
  ).rejects.toThrow('Overloaded');
  expect(deltas).toEqual(['partial ']);
});
