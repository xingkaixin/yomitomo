import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';
import {
  articleTextInputLimit,
  budgetArticleText,
  formatBudgetNotice,
  normalizeAnthropicError,
} from './budget';

describe('llm input budget', () => {
  it('keeps short input unchanged', () => {
    const result = budgetArticleText(provider('claude-sonnet-4-5'), 'agent-message', 'short text');

    expect(result.text).toBe('short text');
    expect(result.report).toMatchObject({
      originalChars: 10,
      includedChars: 10,
      compressed: false,
    });
  });

  it('compresses long input and reports the budget', () => {
    const result = budgetArticleText(
      provider('claude-3-haiku'),
      'agent-message',
      'x'.repeat(40_000),
    );

    expect(result.text.length).toBeLessThan(40_000);
    expect(result.text).toContain('中间内容已按模型输入预算省略');
    expect(formatBudgetNotice([result.report])).toContain('articleText');
  });

  it('uses exact preset model factors instead of model name matching', () => {
    const configuredHaiku = budgetArticleText(
      provider('claude-haiku-4-5', 'anthropic'),
      'agent-message',
      'x'.repeat(40_000),
    );
    const configuredSonnet = budgetArticleText(
      provider('claude-sonnet-4-5', 'anthropic'),
      'agent-message',
      'x'.repeat(40_000),
    );
    const unregisteredHaiku = budgetArticleText(
      provider('claude-future-haiku', 'anthropic'),
      'agent-message',
      'x'.repeat(40_000),
    );

    expect(configuredHaiku.report.includedChars).toBe(18_000);
    expect(configuredSonnet.report.includedChars).toBe(30_000);
    expect(unregisteredHaiku.report.includedChars).toBe(22_500);
  });

  it('normalizes context overflow errors', () => {
    expect(normalizeAnthropicError(400, 'input context length exceeds maximum tokens')).toBe(
      'Model context limit exceeded. Use a larger-context model, narrow the article scope, or reduce annotation evidence and try again.',
    );
  });

  it('exposes the same provider and task limits used by article packing', () => {
    const configured = provider('claude-haiku-4-5', 'anthropic');
    expect(articleTextInputLimit(configured, 'agent-message')).toBe(18_000);
    expect(articleTextInputLimit(configured, 'agent-annotate')).toBe(30_000);
    expect(articleTextInputLimit(provider('claude-future', 'anthropic'), 'agent-message')).toBe(
      22_500,
    );
    expect(budgetArticleText(configured, 'agent-annotate', 'x'.repeat(50_000)).text.length).toBe(
      articleTextInputLimit(configured, 'agent-annotate'),
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
