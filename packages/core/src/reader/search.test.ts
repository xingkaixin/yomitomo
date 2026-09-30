import { describe, expect, it } from 'vitest';
import { createReaderSearch, findReaderSearchMatches } from './search';

describe('findReaderSearchMatches', () => {
  it('matches case-insensitively by default', () => {
    expect(findReaderSearchMatches('Alpha beta ALPHA', 'alpha').matches).toMatchObject([
      { start: 0, end: 5 },
      { start: 11, end: 16 },
    ]);
  });

  it('normalizes whitespace while preserving original offsets', () => {
    expect(findReaderSearchMatches('one\n\n  two three', 'one two').matches[0]).toMatchObject({
      start: 0,
      end: 10,
    });
  });

  it('reports when results are limited', () => {
    const result = findReaderSearchMatches('a a a a', 'a', { limit: 2 });

    expect(result.limited).toBe(true);
    expect(result.matches).toHaveLength(2);
  });

  it('preserves offsets and options across queries of the same document', () => {
    const text = 'Alpha\n  beta ALPHA 中文';
    const search = createReaderSearch(text);

    for (const query of ['', 'alpha beta', 'ALPHA', '中文', 'missing', 'alpha']) {
      expect(search(query, { limit: 1, previewRadius: 3 })).toEqual(
        findReaderSearchMatches(text, query, { limit: 1, previewRadius: 3 }),
      );
    }
    expect(search('beta').matches[0]).toMatchObject({ start: 8, end: 12 });
  });

  it('keeps prepared documents and case-sensitive searches independent', () => {
    const search = createReaderSearch('Alpha ALPHA', true);
    const other = createReaderSearch('other alpha');

    expect(search('alpha').matches).toEqual([]);
    expect(search('ALPHA').matches[0]).toMatchObject({ start: 6, end: 11 });
    expect(other('ALPHA').matches[0]).toMatchObject({ start: 6, end: 11 });
  });
});
