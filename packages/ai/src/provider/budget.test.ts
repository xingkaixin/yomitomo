import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';
import { articleTextInputLimit, normalizeAnthropicError } from './budget';

describe('llm input budget', () => {
  it('uses exact preset model factors instead of model name matching', () => {
    expect(articleTextInputLimit(provider('claude-haiku-4-5', 'anthropic'))).toBe(18_000);
    expect(articleTextInputLimit(provider('claude-sonnet-4-5', 'anthropic'))).toBe(30_000);
    expect(articleTextInputLimit(provider('claude-future-haiku', 'anthropic'))).toBe(22_500);
  });

  it('normalizes context overflow errors', () => {
    expect(normalizeAnthropicError(400, 'input context length exceeds maximum tokens')).toBe(
      'Model context limit exceeded. Use a larger-context model, narrow the article scope, or reduce annotation evidence and try again.',
    );
  });
});

function provider(modelName: string, presetId?: LlmProvider['presetId']): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Anthropic',
    type: 'anthropic',
    presetId,
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    modelName,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}
