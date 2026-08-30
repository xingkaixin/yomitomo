import type { LlmProvider } from '@yomitomo/shared';
import { registerTelemetry } from 'ai';
import { afterEach, expect, it, vi } from 'vitest';
import { generateYomitomoText } from './generation-runtime';

const provider: LlmProvider = {
  id: 'privacy-test-provider',
  name: 'Privacy test provider',
  type: 'openai-chat',
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  modelName: 'privacy-test-model',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const payload = {
  system: 'Private reading instructions',
  user: 'Private reading evidence',
  maxTokens: 128,
};
const responseText = 'Private reading judgment';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('disables global SDK telemetry only for the requested generation', async () => {
  vi.stubGlobal('AI_SDK_TELEMETRY_INTEGRATIONS', []);
  const record = vi.fn();
  registerTelemetry({
    onStart: record,
    onStepStart: record,
    onLanguageModelCallStart: record,
    onLanguageModelCallEnd: record,
    onStepEnd: record,
    onEnd: record,
    onAbort: record,
    onError: record,
    executeLanguageModelCall: async ({ execute, ...event }) => {
      record(event);
      return await execute();
    },
  });

  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
    Response.json({
      choices: [{ index: 0, message: { content: responseText }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }),
  );

  await expect(generateYomitomoText(provider, payload)).resolves.toMatchObject({
    text: responseText,
  });
  expect(record).toHaveBeenCalledWith(
    expect.objectContaining({
      instructions: payload.system,
      messages: [{ role: 'user', content: payload.user }],
    }),
  );
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ text: responseText }));
  record.mockClear();

  await expect(
    generateYomitomoText(provider, payload, { disableTelemetry: true }),
  ).resolves.toMatchObject({ text: responseText });
  expect(record).not.toHaveBeenCalled();

  await expect(
    generateYomitomoText(provider, payload, { disableTelemetry: false }),
  ).resolves.toMatchObject({ text: responseText });
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ instructions: payload.system }));
  expect(record).toHaveBeenCalledWith(expect.objectContaining({ text: responseText }));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
