import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '@yomitomo/shared';
import { budgetArticleText, formatBudgetNotice, normalizeAnthropicError } from './llm-budget';

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

  it('normalizes context overflow errors', () => {
    expect(normalizeAnthropicError(400, 'input context length exceeds maximum tokens')).toBe(
      '模型上下文超限：请换用更大上下文模型，缩小文章范围，或减少批注证据后重试。',
    );
  });
});

function provider(modelName: string): LlmProvider {
  return {
    id: 'provider-1',
    name: 'Anthropic',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant-test',
    modelName,
    createdAt: '2026-05-04T00:00:00.000Z',
    updatedAt: '2026-05-04T00:00:00.000Z',
  };
}
