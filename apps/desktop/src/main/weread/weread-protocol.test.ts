import { describe, expect, it } from 'vitest';
import { buildWeReadOpenUrl, getWeReadStatsPeriodStart } from './weread-protocol';

describe('WeRead open URLs', () => {
  it('encodes numeric book and chapter ids for the web reader', () => {
    expect(buildWeReadOpenUrl({ bookId: '1234567890', chapterUid: 42 }, 'web')).toBe(
      'https://weread.qq.com/web/reader/e80329f0775bcd15g0109e5ka1d32a6022aa1d0c6e83eb4',
    );
  });

  it('encodes text book ids for the web reader', () => {
    expect(buildWeReadOpenUrl({ bookId: 'book_1' }, 'web')).toBe(
      'https://weread.qq.com/web/reader/84042cc0c626f6f6b5f310f8',
    );
  });

  it('opens a selected bookmark with its complete target', () => {
    expect(
      buildWeReadOpenUrl(
        { bookId: 'book_1', chapterUid: 7, range: '10-24', userVid: 9 },
        'deeplink',
      ),
    ).toBe('weread://bestbookmark?bookId=book_1&chapterUid=7&rangeStart=10&rangeEnd=24&userVid=9');
  });

  it('falls back to the chapter reading link without a selected range', () => {
    expect(buildWeReadOpenUrl({ bookId: 'book_1', chapterUid: 7 }, 'deeplink')).toBe(
      'weread://reading?bId=book_1&chapterUid=7',
    );
  });
});

describe('WeRead reading stats periods', () => {
  const baseTime = new Date(2026, 6, 15, 12).getTime() / 1000;

  it.each([
    ['weekly', new Date(2026, 6, 13).getTime() / 1000],
    ['monthly', new Date(2026, 6, 1).getTime() / 1000],
    ['annually', new Date(2026, 0, 1).getTime() / 1000],
    ['overall', 0],
  ] as const)('calculates the %s period start', (mode, expected) => {
    expect(getWeReadStatsPeriodStart(mode, baseTime)).toBe(expected);
  });
});
