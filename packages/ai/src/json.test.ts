import { describe, expect, it } from 'vitest';
import { parseJsonObject, stringArray } from './json';

describe('JSON coercion', () => {
  it('preserves the default string item limit', () => {
    const text = 'x'.repeat(600);

    expect(stringArray([text])).toEqual(['x'.repeat(500)]);
  });

  it('allows callers to preserve unbounded string items', () => {
    const text = 'x'.repeat(600);

    expect(stringArray([text], Number.POSITIVE_INFINITY)).toEqual([text]);
  });

  it('preserves caller-specific parse failure messages', () => {
    expect(() => parseJsonObject('invalid', 'READING_MEMORY_JSON_PARSE_FAILED')).toThrow(
      'READING_MEMORY_JSON_PARSE_FAILED',
    );
  });
});
