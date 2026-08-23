import { describe, expect, it } from 'vitest';
import { extractJsonObjects, parseJsonObject, stringArray } from './json';

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

describe('extractJsonObjects', () => {
  it('extracts pretty-printed objects from a stream buffer', () => {
    const result = extractJsonObjects(`{
  "exact": "target",
  "prefix": "before",
  "suffix": "after",
  "type": "quote",
  "comment": "note"
}
{
  "exact": "next"`);

    expect(result.objects).toEqual([
      `{
  "exact": "target",
  "prefix": "before",
  "suffix": "after",
  "type": "quote",
  "comment": "note"
}`,
    ]);
    expect(result.rest).toBe(`{
  "exact": "next"`);
  });

  it('keeps braces inside strings as content', () => {
    const result = extractJsonObjects(
      '{"exact":"target","comment":"use {literal} braces and \\"quotes\\""}',
    );

    expect(result.objects).toHaveLength(1);
    expect(JSON.parse(result.objects[0])).toEqual({
      exact: 'target',
      comment: 'use {literal} braces and "quotes"',
    });
    expect(result.rest).toBe('');
  });
});
