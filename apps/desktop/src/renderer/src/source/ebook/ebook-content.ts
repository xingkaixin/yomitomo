import i18next from 'i18next';
import type { ArticleRecord } from '@yomitomo/shared';
import type { TocItem } from '@yomitomo/core';
import type { ReaderReadingSection } from '@yomitomo/reader-ui/reader-types';
import type { FoliateTocItem, FoliateViewElement } from './ebook-foliate-view';

export function ebookHasStableSectionChapterMapping(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
) {
  return article.ebook.metadata.format === 'epub';
}

export function ebookReaderReadingSections(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  text: string,
): ReaderReadingSection[] {
  const index = article.ebook.index;
  if (!index?.chapters.length) {
    return text ? [{ id: 'ebook', title: article.title, start: 0, end: text.length }] : [];
  }
  return index.chapters.map((chapter) => ({
    id: chapter.id,
    title:
      chapter.title || i18next.t('ebookReader.chapterLabel', { chapter: chapter.indexInBook + 1 }),
    start: chapter.textStart,
    end: chapter.textEnd,
  }));
}

export function ebookTocItemsForReader(
  tocItems: FoliateTocItem[],
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
): TocItem[] {
  const textLength = article.ebook.index?.textLength || 0;
  const chapters = article.ebook.index?.chapters || [];
  const tocStarts = tocItems.map((item, index) => {
    const chapter = ebookChapterForHref(article, item.href) || chapters[index];
    return chapter?.textStart ?? 0;
  });
  return tocItems.map((item, index) => {
    const chapter = ebookChapterForHref(article, item.href) || chapters[index];
    const start = chapter?.textStart ?? 0;
    const nextBoundary = nextTocBoundary(tocItems, tocStarts, index, textLength);
    return {
      index,
      text: item.label,
      depth: item.depth,
      start,
      end: Math.max(chapter?.textEnd ?? start, nextBoundary),
    };
  });
}

function nextTocBoundary(
  tocItems: FoliateTocItem[],
  starts: number[],
  index: number,
  textLength: number,
) {
  const item = tocItems[index];
  if (!item) return textLength;
  const start = starts[index] ?? 0;
  for (let nextIndex = index + 1; nextIndex < tocItems.length; nextIndex += 1) {
    const nextItem = tocItems[nextIndex];
    if (!nextItem || nextItem.depth > item.depth) continue;
    const nextStart = starts[nextIndex] ?? textLength;
    if (nextStart > start) return nextStart;
  }
  return textLength;
}

export function ebookChapterForHref(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  href: unknown,
) {
  const normalizedHref = normalizeEbookHref(href);
  if (!normalizedHref) return null;
  return (
    article.ebook.index?.chapters.find((chapter) =>
      ebookHrefMatches(normalizeEbookHref(chapter.href), normalizedHref),
    ) || null
  );
}

export function ebookChapterForFoliateSection(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement | null,
  sectionIndex: number,
) {
  const section = view?.book?.sections?.[sectionIndex];
  const byHref = ebookChapterForHref(article, section?.id);
  if (byHref) return byHref;
  if (!ebookHasStableSectionChapterMapping(article)) return null;
  return article.ebook.index?.chapters[sectionIndex] || null;
}

export function ebookSectionIndexForChapter(
  article: ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> },
  view: FoliateViewElement,
  chapter: NonNullable<NonNullable<ArticleRecord['ebook']>['index']>['chapters'][number],
) {
  const sections = view.book?.sections || [];
  const chapterHref = normalizeEbookHref(chapter.href);
  const matchedIndex = sections.findIndex((section) =>
    ebookHrefMatches(normalizeEbookHref(section.id), chapterHref),
  );
  if (matchedIndex >= 0) return matchedIndex;
  if (!ebookHasStableSectionChapterMapping(article)) return -1;
  return chapter.indexInBook < sections.length ? chapter.indexInBook : -1;
}

function normalizeEbookHref(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.split('#')[0]?.replace(/^\/+/, '') || '';
}

function ebookHrefMatches(left: string, right: string) {
  if (!left || !right) return false;
  return left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`);
}
