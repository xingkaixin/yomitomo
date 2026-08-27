import { expect, it } from 'vitest';
import { normalizeArticleTranslationTargetLanguage } from './article-translation';

it.each(['en', ' English '])('normalizes the English alias %s', (value) => {
  expect(normalizeArticleTranslationTargetLanguage(value)).toBe('English');
});

it.each(['ja', ' Japanese ', '日本語'])('normalizes the Japanese alias %s', (value) => {
  expect(normalizeArticleTranslationTargetLanguage(value)).toBe('日本語');
});

it('preserves the Chinese default for missing and unsupported language values', () => {
  for (const value of [undefined, '', 'zh-CN', '简体中文', 'unsupported']) {
    expect(normalizeArticleTranslationTargetLanguage(value)).toBe('简体中文');
  }
});
