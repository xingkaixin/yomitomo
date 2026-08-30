import { isRecord } from '../runtime-guards';

export const readingMemoryUsageKeys = [
  'feature_opened',
  'query_completed',
  'source_jump',
  'review_still_agree',
  'review_changed',
  'review_need_evidence',
  'fallback_keyword',
  'fallback_partial_index',
  'fallback_no_provider',
  'fallback_call_failure',
] as const;

export type ReadingMemoryUsageKey = (typeof readingMemoryUsageKeys)[number];

export type ReadingMemoryUsagePayload = {
  counts: Partial<Record<ReadingMemoryUsageKey, number>>;
};

export const maxReadingMemoryUsageCount = 2 ** 16 - 1;

export function parseReadingMemoryUsagePayload(input: unknown): ReadingMemoryUsagePayload | null {
  if (!isRecord(input) || Object.keys(input).length !== 1 || !isRecord(input.counts)) return null;
  const entries = Object.entries(input.counts);
  if (entries.length === 0 || entries.length > readingMemoryUsageKeys.length) return null;

  const counts: ReadingMemoryUsagePayload['counts'] = {};
  for (const [key, value] of entries) {
    const allowedKey = readingMemoryUsageKeys.find((allowed) => allowed === key);
    if (
      !allowedKey ||
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < 1 ||
      value > maxReadingMemoryUsageCount
    ) {
      return null;
    }
    counts[allowedKey] = value;
  }
  return { counts };
}
