import type { LlmProvider } from '@yomitomo/shared';
import { Cause, Effect, Exit, Fiber } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setAiLogger } from '../logger';
import { generateYomitomoText, generateYomitomoTextEffect } from './generation-runtime';

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

  it('fails with a typed empty response error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => completionStream(''));

    const exit = await Effect.runPromiseExit(generateYomitomoTextEffect(provider(), payload()));

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isSuccess(exit)) return;
    expect(Cause.squash(exit.cause)).toMatchObject({ _tag: 'GenerationEmptyResponseError' });
  });

  it('aborts the request when its Effect fiber is interrupted', async () => {
    const started = pendingFetch();
    const fiber = Effect.runFork(generateYomitomoTextEffect(provider(), payload()));

    const signal = await started;
    await Effect.runPromise(Fiber.interrupt(fiber));

    expect(signal.aborted).toBe(true);
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

  it('records when an API key is not configured', async () => {
    const startEvents = captureGenerationStarts();
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => completionStream('ok'));

    await generateYomitomoText({ ...provider(), apiKey: '' }, payload()).catch(() => undefined);

    expect(startEvents[0]).toMatchObject({ hasApiKey: false });
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

function pendingFetch() {
  let resolveSignal: (signal: AbortSignal) => void = () => undefined;
  const started = new Promise<AbortSignal>((resolve) => {
    resolveSignal = resolve;
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
    const signal = init?.signal;
    if (!signal) throw new Error('Expected fetch AbortSignal');
    resolveSignal(signal);
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    });
  });
  return started;
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
