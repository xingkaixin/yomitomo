import { describe, expect, it } from 'vitest';
import { findReaderSearchMatches } from './search';

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
});
