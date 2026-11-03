import type { LlmProvider } from '@yomitomo/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setAiLogger } from '../logger';
import { generateYomitomoText } from './generation-runtime';

afterEach(() => {
  setAiLogger({});
  vi.restoreAllMocks();
});

describe('generateYomitomoText', () => {
  it('returns the streamed text and usage', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => completionStream('OK'));

    await expect(generateYomitomoText(provider(), payload())).resolves.toMatchObject({
      text: 'OK',
      usage: { inputTokens: 8, outputTokens: 4 },
      finishReason: 'stop',
    });
  });
});

describe('provider generation logging', () => {
  it('does not expose API key-derived fields in generation logs', async () => {
    const apiKey = 'rd819-sensitive-credential';
    const startEvents = captureGenerationStarts();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => completionStream('ok'));

    await generateYomitomoText({ ...provider(), apiKey }, payload());

    expect(startEvents).toEqual([expect.objectContaining({ providerId: 'p', hasApiKey: true })]);
    expectLogToExcludeCredential(startEvents[0], apiKey);
  });
});

function completionStream(text: string) {
  const chunks = [
    { choices: [{ index: 0, delta: { content: text }, finish_reason: null }] },
    {
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    },
  ];
  const body = `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`;
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

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
    id: 'p',
    name: 'Provider',
    type: 'openai-chat',
    baseUrl: 'https://example.com/v1',
    apiKey: 'key',
    modelName: 'model',
    createdAt: '',
    updatedAt: '',
  };
}

function payload() {
  return { system: 'system', user: 'user', maxTokens: 128 };
}
