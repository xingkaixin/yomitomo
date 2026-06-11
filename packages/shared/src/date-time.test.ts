import { describe, expect, it } from 'vitest';
import { formatDateTimeValue, relativeTimeParts } from './date-time';

describe('date time utilities', () => {
  const now = new Date('2026-05-27T12:00:00.000Z');

  it('classifies relative time threshold boundaries', () => {
    expect(relativeTimeParts('2026-05-27T11:59:01.000Z', now)).toEqual({
      count: 0,
      unit: 'second',
    });
    expect(relativeTimeParts('2026-05-27T11:59:00.000Z', now)).toEqual({
      count: 1,
      unit: 'minute',
    });
    expect(relativeTimeParts('2026-05-27T11:00:00.000Z', now)).toEqual({
      count: 1,
      unit: 'hour',
    });
    expect(relativeTimeParts('2026-05-26T12:00:00.000Z', now)).toEqual({
      count: 1,
      unit: 'day',
    });
    expect(relativeTimeParts('2026-05-20T12:00:00.000Z', now)).toEqual({
      count: 1,
      unit: 'week',
    });
    expect(relativeTimeParts('2026-04-27T12:00:00.000Z', now)).toEqual({
      count: 1,
      unit: 'month',
    });
    expect(relativeTimeParts('2025-05-27T12:00:00.000Z', now)).toEqual({
      count: 1,
      unit: 'year',
    });
  });

  it('returns null for invalid relative time input', () => {
    expect(relativeTimeParts('not a date', now)).toBeNull();
  });

  it('returns original date time input when parsing fails', () => {
    expect(formatDateTimeValue('not a date', 'en-US', { year: 'numeric' })).toBe('not a date');
  });
});
