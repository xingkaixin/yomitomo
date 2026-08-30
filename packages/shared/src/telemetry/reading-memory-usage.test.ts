import { describe, expect, it } from 'vitest';
import {
  maxReadingMemoryUsageCount,
  parseReadingMemoryUsagePayload,
  readingMemoryUsageKeys,
} from './reading-memory-usage';

describe('reading memory usage payload', () => {
  it('accepts only bounded counts for the closed set of actions', () => {
    const counts = Object.fromEntries(readingMemoryUsageKeys.map((key) => [key, 1]));
    expect(parseReadingMemoryUsagePayload({ counts })).toEqual({ counts });
    expect(
      parseReadingMemoryUsagePayload({ counts: { feature_opened: maxReadingMemoryUsageCount } }),
    ).toEqual({ counts: { feature_opened: maxReadingMemoryUsageCount } });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 65_536, '1', null])(
    'rejects invalid count %s',
    (count) => {
      expect(parseReadingMemoryUsagePayload({ counts: { query_completed: count } })).toBeNull();
    },
  );

  it('rejects empty payloads and unknown fields instead of silently removing them', () => {
    for (const input of [null, [], {}, { counts: {} }, { counts: [] }]) {
      expect(parseReadingMemoryUsagePayload(input)).toBeNull();
    }
    for (const key of [
      'installId',
      'articleId',
      'question',
      'title',
      'excerpt',
      'citation',
      'judgment',
      'answer',
      'clientDay',
      'appVersion',
    ]) {
      expect(
        parseReadingMemoryUsagePayload({ counts: { source_jump: 1 }, [key]: 'private' }),
      ).toBeNull();
      expect(parseReadingMemoryUsagePayload({ counts: { source_jump: 1, [key]: 1 } })).toBeNull();
    }
  });
});
