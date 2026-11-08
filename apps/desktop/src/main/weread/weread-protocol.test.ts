import { describe, expect, it } from 'vitest';
import {
  buildWeReadOpenUrl,
  getWeReadStatsPeriodStart,
  isWeReadReaderUrl,
} from './weread-protocol';

describe('WeRead open URLs', () => {
  it('encodes numeric book and chapter ids for the web reader', () => {
    expect(buildWeReadOpenUrl({ bookId: '1234567890', chapterUid: 42 }, 'web')).toBe(
      'https://weread.qq.com/web/reader/e80329f0775bcd15g0109e5ka1d32a6022aa1d0c6e83eb4',
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
});

describe('WeRead in-app reader navigation', () => {
  it('keeps the login redirect back to the reader inside the window', () => {
    expect(isWeReadReaderUrl('https://weread.qq.com/?code=abc&state=')).toBe(true);
  });

  it.each([
    'https://open.weixin.qq.com/connect/qrconnect',
    'https://weread.qq.com.evil.example/web/reader/x',
    'http://weread.qq.com/web/reader/x',
    'https://weread.qq.com:8443/web/reader/x',
    'javascript:alert(1)',
  ])('sends %s out of the logged-in window', (url) => {
    expect(isWeReadReaderUrl(url)).toBe(false);
  });
});

describe('WeRead reading stats periods', () => {
  const baseTime = new Date(2026, 6, 15, 12).getTime() / 1000;

  it.each([['weekly', new Date(2026, 6, 13).getTime() / 1000]] as const)(
    'calculates the %s period start',
    (mode, expected) => {
      expect(getWeReadStatsPeriodStart(mode, baseTime)).toBe(expected);
    },
  );
});
