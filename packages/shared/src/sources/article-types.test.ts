import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ARTICLE_SOURCE_TYPES,
  normalizeArticleSourceType,
  type ArticleSourceType,
} from './article-types';

describe('article source types', () => {
  it('derives the closed source type from the runtime values', () => {
    expect(ARTICLE_SOURCE_TYPES).toEqual(['web', 'ebook', 'pdf', 'text']);
    expectTypeOf<(typeof ARTICLE_SOURCE_TYPES)[number]>().toEqualTypeOf<ArticleSourceType>();
  });

  it.each(ARTICLE_SOURCE_TYPES)('keeps %s as a valid article source', (sourceType) => {
    expect(normalizeArticleSourceType(sourceType)).toBe(sourceType);
  });

  it.each([undefined, null, '', 'weread', 'unknown', 1])('normalizes %j to web', (sourceType) => {
    expect(normalizeArticleSourceType(sourceType)).toBe('web');
  });
});
