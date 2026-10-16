import { describe, expect, it } from 'vitest';
import { createArticleTextIndex, splitArticleTextBlocks } from './article-text-index';

describe('splitArticleTextBlocks', () => {
  it('joins wrapped lines into sentences and cuts long unbroken text', () => {
    const wrapped =
      'The first sentence wraps\nonto the next line.\nShort heading\n\nNext paragraph.';
    expect(splitArticleTextBlocks(wrapped).map((block) => block.text)).toEqual([
      'The first sentence wraps\nonto the next line.',
      'Short heading',
      'Next paragraph.',
    ]);

    const long = '这是一句很长的话。'.repeat(300);
    const blocks = splitArticleTextBlocks(long);
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.every((block) => block.text.length <= 1200 && block.text.endsWith('。'))).toBe(
      true,
    );
    expect(blocks.map((block) => long.slice(block.start, block.end))).toEqual(
      blocks.map((block) => block.text),
    );
  });
});

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
