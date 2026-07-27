import { describe, expect, it } from 'vitest';
import { readingProgressRatio } from './reading-progress';

const updatedAt = '2026-07-27T00:00:00.000Z';

describe('readingProgressRatio', () => {
  it('returns zero without saved progress', () => {
    expect(readingProgressRatio(undefined)).toBe(0);
  });

  it('reads scroll progress directly', () => {
    expect(readingProgressRatio({ kind: 'scroll', progress: 0.42, updatedAt })).toBe(0.42);
  });

  it('derives page progress from the current page', () => {
    expect(readingProgressRatio({ kind: 'page', pageIndex: 4, pageCount: 9, updatedAt })).toBe(0.5);
    expect(readingProgressRatio({ kind: 'page', pageIndex: 0, pageCount: 1, updatedAt })).toBe(1);
  });

  it('uses the independent whole-book progress for chapter anchors', () => {
    expect(
      readingProgressRatio({
        kind: 'chapter',
        chapterIndex: 2,
        chapterProgress: 0.6,
        bookProgress: 0.35,
        updatedAt,
      }),
    ).toBe(0.35);
  });
});
