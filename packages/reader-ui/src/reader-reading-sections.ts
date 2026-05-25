import { offsetFromArticleStart } from '@yomitomo/core';
import type { ReaderReadingSection } from './reader-types';
import type { TocItem } from '@yomitomo/core';

export function buildReaderReadingSections(
  articleElement: HTMLElement,
  tocItems: TocItem[],
  articleTitle: string,
  bodySelector = '.reader-article-body',
): ReaderReadingSection[] {
  const body = articleElement.querySelector(bodySelector);
  const bodyStart = body ? offsetFromArticleStart(articleElement, body, 0) : 0;
  const articleText = articleElement.textContent || '';
  const bodyEnd = Math.max(bodyStart, articleText.length);
  const titleText = normalizeReaderHeadingText(articleTitle);
  const bodyTocItems = tocItems.filter(
    (item) => item.start >= bodyStart && normalizeReaderHeadingText(item.text) !== titleText,
  );
  const sectionDepth = bodyTocItems[0]?.depth;
  const sectionTocItems =
    sectionDepth === undefined ? [] : bodyTocItems.filter((item) => item.depth === sectionDepth);
  const sections: ReaderReadingSection[] = [];
  const firstSectionStart = sectionTocItems[0]
    ? clampSectionOffset(sectionTocItems[0].start, bodyStart, bodyEnd)
    : bodyEnd;

  if (readableSectionText(articleText, bodyStart, firstSectionStart)) {
    sections.push({
      id: 'intro',
      title: '引文',
      start: bodyStart,
      end: firstSectionStart,
    });
  }

  for (const item of sectionTocItems) {
    const start = clampSectionOffset(item.start, bodyStart, bodyEnd);
    const end = clampSectionOffset(item.end, start, bodyEnd);
    if (end <= start) continue;
    sections.push({
      id: `toc-${item.index}`,
      title: item.text,
      start,
      end,
    });
  }

  if (sections.length > 0) return sections;

  return [
    {
      id: 'body',
      title: '正文',
      start: bodyStart,
      end: bodyEnd,
    },
  ];
}

function readableSectionText(text: string, start: number, end: number) {
  return text.slice(start, end).trim().length > 0;
}

function normalizeReaderHeadingText(text: string) {
  return text.trim().replace(/\s+/g, ' ');
}

function clampSectionOffset(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}
