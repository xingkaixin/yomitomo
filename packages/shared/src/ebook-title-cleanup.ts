export type EpubTitleCleanupInput = {
  metadataTitle?: string;
  fileName?: string;
  creator?: string;
};

export const EPUB_TITLE_CLEANUP_VERSION = 1;

const FALLBACK_TITLE = '未命名电子书';
const UNHELPFUL_TITLES = new Set(['未知', 'unknown', 'untitled', 'untitled book', '无题']);
const MARKETING_KEYWORDS = [
  '推荐',
  '豆瓣',
  '评分',
  '畅销',
  '经典',
  '荣获',
  '大奖',
  '奥斯卡',
  '普利策',
  '雨果奖',
  '星云奖',
  '出品',
  '力荐',
  '震惊全球',
  '首度披露',
  '作者经典之作',
  '横扫',
  '勇夺',
  '揭露',
];

const BRACKET_PAIRS: Array<[string, string]> = [
  ['（', '）'],
  ['(', ')'],
  ['【', '】'],
  ['[', ']'],
  ['「', '」'],
  ['『', '』'],
];

export function cleanEpubDisplayTitle(input: EpubTitleCleanupInput) {
  const metadataTitle = normalizeTitleText(input.metadataTitle);
  const fileNameTitle = cleanEpubFileNameTitle(input.fileName, input.creator);
  const title = isUnhelpfulTitle(metadataTitle)
    ? fileNameTitle
    : cleanMarketingTitleSegments(metadataTitle);
  return normalizeTitleText(title) || fileNameTitle || metadataTitle || FALLBACK_TITLE;
}

export function cleanEpubFileNameTitle(fileName: string | undefined, creator?: string) {
  let title = normalizeTitleText(fileName ? baseFileName(fileName).replace(/\.epub$/i, '') : '');
  if (!title) return '';

  title = title
    .replace(/\s*[[(（【]\s*(?:z-library|z-lib(?:\.org)?|zlibrary)\s*[\])）】]\s*/gi, ' ')
    .replace(/\s*(?:-|_|—|–)\s*(?:z-library|z-lib(?:\.org)?|zlibrary)\s*$/i, '');

  const creatorText = normalizeTitleText(creator);
  if (creatorText) {
    const escapedCreator = escapeRegExp(creatorText);
    title = title
      .replace(new RegExp(`\\s*(?:-|_|—|–)\\s*${escapedCreator}\\s*$`, 'i'), '')
      .replace(new RegExp(`\\s*[_-]\\s*${escapedCreator}\\s*$`, 'i'), '');
  }

  return normalizeTitleText(title);
}

function cleanMarketingTitleSegments(value: string) {
  let title = value;
  for (const [open, close] of BRACKET_PAIRS) {
    title = removeMarketingBracketSegments(title, open, close);
  }
  return normalizeTitleText(
    title
      .replace(/[，,、\s]+[^，,、\s]{1,18}出品$/u, '')
      .replace(/(?:浦睿文化|读客熊猫君|读客|磨铁文化|果麦文化|后浪|湛庐文化|理想国)出品$/u, '')
      .replace(/[，,、\s]*(?:[^\s，,、]{1,18})力荐$/u, ''),
  );
}

function removeMarketingBracketSegments(value: string, open: string, close: string) {
  let result = '';
  let cursor = 0;

  while (cursor < value.length) {
    const start = value.indexOf(open, cursor);
    if (start === -1) {
      result += value.slice(cursor);
      break;
    }

    const end = value.indexOf(close, start + open.length);
    if (end === -1) {
      const content = value.slice(start + open.length);
      result += value.slice(cursor, isMarketingText(content) ? start : value.length);
      break;
    }

    const content = value.slice(start + open.length, end);
    result += value.slice(cursor, start);
    if (!isMarketingText(content)) result += value.slice(start, end + close.length);
    cursor = end + close.length;
  }

  return result;
}

function isMarketingText(value: string) {
  return MARKETING_KEYWORDS.some((keyword) => value.includes(keyword));
}

function isUnhelpfulTitle(value: string) {
  if (!value) return true;
  return UNHELPFUL_TITLES.has(value.toLocaleLowerCase('zh-CN'));
}

function normalizeTitleText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    .replace(/([\u3400-\u9fff])\s+(\d)/g, '$1$2')
    .replace(/(\d)\s+([\u3400-\u9fff])/g, '$1$2')
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function baseFileName(value: string) {
  return value.replace(/\\/g, '/').split('/').pop() || value;
}
