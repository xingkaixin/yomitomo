import { describe, expect, it } from 'vitest';
import { createArticleTextIndex } from './article-text-index';

describe('createArticleTextIndex', () => {
  const text = 'Chapter one\nAlpha meets Beta.\nChapter two\nBeta betrays Alpha.';
  const sections = [
    { id: 'c1', title: 'Chapter one', start: 0, end: 29 },
    { id: 'c2', title: 'Chapter two', start: 29, end: text.length },
  ];

  it('hides text outside the visible ranges from every reader', () => {
    const index = createArticleTextIndex({ text, sections }, [{ textStart: 0, textEnd: 29 }]);
    expect(index.outline().map((section) => section.id)).toEqual(['c1']);
    expect(index.search('betrays', 5)).toEqual([]);
    expect(index.readSection('c2')).toEqual({ blocks: [] });
    expect(index.search('Beta', 5).map((hit) => hit.section?.id)).toEqual(['c1']);
  });
});
