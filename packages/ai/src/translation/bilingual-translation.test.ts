import type { LlmProvider } from '@yomitomo/shared';
import { afterEach, expect, it, vi } from 'vitest';
import { translateBilingualArticleBlocks } from './bilingual-translation';

const provider: LlmProvider = {
  id: 'translation-test',
  name: 'Translation test',
  type: 'openai-chat',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  modelName: 'test-model',
  createdAt: '',
  updatedAt: '',
};

afterEach(() => vi.restoreAllMocks());

it('cancels the provider request and never starts the next translation batch', async () => {
  const controller = new AbortController();
  let requestSignal: AbortSignal | undefined;
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error('Expected a cancellable provider request');
    requestSignal = signal;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  const running = translateBilingualArticleBlocks(
    {
      provider,
      blocks: [
        { id: 'first', text: 'a'.repeat(6000) },
        { id: 'next', text: 'next paragraph' },
      ],
      targetLanguage: 'Chinese',
    },
    controller.signal,
  );
  const rejected = expect(running).rejects.toThrow();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

  controller.abort();
  await rejected;

  expect(requestSignal?.aborted).toBe(true);
  expect(fetchMock).toHaveBeenCalledOnce();
});
