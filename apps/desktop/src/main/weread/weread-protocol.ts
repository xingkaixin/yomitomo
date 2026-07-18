import { createHash } from 'node:crypto';
import type { WeReadOpenMethod, WeReadReadingStatsMode } from '@yomitomo/shared';

export function buildWeReadOpenUrl(
  target: { bookId: string; chapterUid?: number; range?: string; userVid?: number },
  method: WeReadOpenMethod,
) {
  if (method === 'web') {
    const webBookId = buildWeReadWebBookId(target.bookId);
    const webReaderId =
      target.chapterUid !== undefined
        ? `${webBookId}k${buildWeReadWebBookId(String(target.chapterUid))}`
        : webBookId;
    const url = new URL(`https://weread.qq.com/web/reader/${encodeURIComponent(webReaderId)}`);
    return url.href;
  }

  if (target.chapterUid !== undefined && target.range) {
    const [rangeStart, rangeEnd] = target.range.split('-');
    const url = new URL('weread://bestbookmark');
    url.searchParams.set('bookId', target.bookId);
    url.searchParams.set('chapterUid', String(target.chapterUid));
    if (rangeStart) url.searchParams.set('rangeStart', rangeStart);
    if (rangeEnd) url.searchParams.set('rangeEnd', rangeEnd);
    if (target.userVid !== undefined) url.searchParams.set('userVid', String(target.userVid));
    return url.href;
  }

  const url = new URL('weread://reading');
  url.searchParams.set('bId', target.bookId);
  if (target.chapterUid !== undefined)
    url.searchParams.set('chapterUid', String(target.chapterUid));
  return url.href;
}

export function getWeReadStatsPeriodStart(mode: WeReadReadingStatsMode, baseTime?: number) {
  if (mode === 'overall') return 0;
  const date = new Date((baseTime ?? Math.floor(Date.now() / 1000)) * 1000);
  date.setHours(0, 0, 0, 0);
  if (mode === 'weekly') {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
  } else if (mode === 'monthly') {
    date.setDate(1);
  } else {
    date.setMonth(0, 1);
  }
  return Math.floor(date.getTime() / 1000);
}

function buildWeReadWebBookId(bookId: string) {
  const digest = md5(bookId);
  const [type, segments] = transformWeReadBookId(bookId);
  let result = `${digest.slice(0, 3)}${type}2${digest.slice(-2)}`;

  for (const [index, segment] of segments.entries()) {
    result += `${segment.length.toString(16).padStart(2, '0')}${segment}`;
    if (index < segments.length - 1) result += 'g';
  }

  if (result.length < 20) result += digest.slice(0, 20 - result.length);
  return `${result}${md5(result).slice(0, 3)}`;
}

function transformWeReadBookId(bookId: string): [string, string[]] {
  if (/^\d+$/.test(bookId)) {
    const segments: string[] = [];
    for (let index = 0; index < bookId.length; index += 9) {
      segments.push(Number(bookId.slice(index, index + 9)).toString(16));
    }
    return ['3', segments];
  }

  let hexId = '';
  for (const char of bookId) hexId += char.charCodeAt(0).toString(16);
  return ['4', [hexId]];
}

function md5(value: string) {
  return createHash('md5').update(value).digest('hex');
}
