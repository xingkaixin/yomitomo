import { describe, expect, it } from 'vitest';
import { findReaderSearchMatches } from './search';

describe('findReaderSearchMatches', () => {
  it('normalizes whitespace while preserving original offsets', () => {
    expect(findReaderSearchMatches('one\n\n  two three', 'one two').matches[0]).toMatchObject({
      start: 0,
      end: 10,
    });
  });

  it('keeps offsets after characters that lengthen when lowercased', () => {
    const text = 'İstanbul and Ankara and İzmir and Ankara';
    const slices = findReaderSearchMatches(text, 'ankara').matches.map(({ start, end }) =>
      text.slice(start, end),
    );

    expect(slices).toEqual(['Ankara', 'Ankara']);
  });
});
