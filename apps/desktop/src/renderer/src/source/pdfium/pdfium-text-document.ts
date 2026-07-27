import type { PdfBookmarkObject } from '@embedpdf/models';
import i18next from 'i18next';
import {
  isPdfTextAnchor,
  type Annotation,
  type PdfTextAnchor,
  type PublicAgent,
  type UserProfile,
} from '@yomitomo/shared';
import { annotationColor, annotationHasPublishedDistillation, type TocItem } from '@yomitomo/core';

export type PdfPageTextIndex = {
  pageIndex: number;
  pageText: string;
  textStart: number;
  textEnd: number;
  bodyStart: number;
  bodyEnd: number;
};

export type PdfTextDocument = {
  text: string;
  pages: PdfPageTextIndex[];
};

export function buildPdfTextDocument(pageTexts: string[]): PdfTextDocument {
  let text = '';
  const pages: PdfPageTextIndex[] = [];
  pageTexts.forEach((pageText, pageIndex) => {
    if (pageIndex > 0) text += '\n\n';
    const header = `${i18next.t('pdfReader.pageLabel', { page: pageIndex + 1 })}\n`;
    const textStart = text.length;
    text += header;
    const bodyStart = text.length;
    text += pageText;
    const bodyEnd = text.length;
    pages.push({
      pageIndex,
      pageText,
      textStart,
      textEnd: text.length,
      bodyStart,
      bodyEnd,
    });
  });
  return { text, pages };
}

export function pdfReaderReadingSections(
  textDocument: PdfTextDocument,
  tocItems: TocItem[],
  pageCount: number,
) {
  const tocSections = pdfReaderBookmarkRanges(textDocument, tocItems).flatMap((range) =>
    pdfReadingSectionForTextRange(
      textDocument,
      range.start,
      range.end,
      `pdf-bookmark-${range.pageIndex + 1}-${range.localStart}-${range.item.index}`,
      range.item.text,
    ),
  );
  if (tocSections.length > 0) return tocSections;

  const pageGroupSize = 5;
  const sections = [];
  for (let startPage = 0; startPage < pageCount; startPage += pageGroupSize) {
    const endPage = Math.min(pageCount, startPage + pageGroupSize);
    sections.push(
      ...pdfReadingSectionForPageRange(
        textDocument,
        startPage,
        endPage,
        `pdf-pages-${startPage + 1}-${endPage}`,
        startPage + 1 === endPage
          ? i18next.t('pdfReader.pageLabel', { page: endPage })
          : i18next.t('pdfReader.pageRange', { end: endPage, start: startPage + 1 }),
      ),
    );
  }
  return sections;
}

export function pdfReaderBookmarkRanges(textDocument: PdfTextDocument, tocItems: TocItem[]) {
  const orderedBoundaries = pdfReaderBookmarkBoundaries(textDocument, tocItems);
  return orderedBoundaries.flatMap((boundary, index) => {
    const end = orderedBoundaries[index + 1]?.start ?? textDocument.text.length;
    return end > boundary.start ? [{ ...boundary, end }] : [];
  });
}

export function pdfReaderBookmarkBoundaries(textDocument: PdfTextDocument, tocItems: TocItem[]) {
  const searchStartByPage = new Map<number, number>();
  return tocItems
    .toSorted((left, right) => left.start - right.start || left.index - right.index)
    .flatMap((item) => {
      const page = textDocument.pages[item.start];
      if (!page) return [];
      const searchStart = searchStartByPage.get(page.pageIndex) ?? 0;
      const foundAfterPrevious = page.pageText.indexOf(item.text, searchStart);
      const found = foundAfterPrevious >= 0 ? foundAfterPrevious : page.pageText.indexOf(item.text);
      const localStart = Math.max(
        0,
        Math.min(found >= 0 ? found : searchStart, page.pageText.length),
      );
      searchStartByPage.set(page.pageIndex, localStart + item.text.length);
      return [
        {
          item,
          pageIndex: page.pageIndex,
          localStart,
          start: page.bodyStart + localStart,
        },
      ];
    });
}

export function pdfReadingSectionForTextRange(
  textDocument: PdfTextDocument,
  start: number,
  end: number,
  id: string,
  title: string,
) {
  const safeStart = Math.max(0, Math.min(start, textDocument.text.length));
  const safeEnd = Math.max(safeStart, Math.min(end, textDocument.text.length));
  if (!textDocument.text.slice(safeStart, safeEnd).trim()) return [];
  return [
    {
      id,
      title,
      start: safeStart,
      end: safeEnd,
    },
  ];
}

export function pdfReadingSectionForPageRange(
  textDocument: PdfTextDocument,
  startPage: number,
  endPage: number,
  id: string,
  title: string,
) {
  const pages = textDocument.pages
    .slice(Math.max(0, startPage), Math.min(textDocument.pages.length, endPage))
    .filter((page) => page.pageText.trim());
  const firstPage = pages[0];
  const lastPage = pages[pages.length - 1];
  if (!firstPage || !lastPage || lastPage.bodyEnd <= firstPage.bodyStart) return [];
  return [
    {
      id,
      title,
      start: firstPage.bodyStart,
      end: lastPage.bodyEnd,
    },
  ];
}

export function pdfiumBookmarkTocItems(
  bookmarks: PdfBookmarkObject[],
  pageCount: number,
): TocItem[] {
  const items: TocItem[] = [];

  function visit(bookmarkItems: PdfBookmarkObject[], depth: number) {
    for (const bookmark of bookmarkItems) {
      const title = bookmark.title.trim();
      const pageIndex = pdfiumBookmarkPageIndex(bookmark);
      if (title && pageIndex !== null) {
        items.push({
          index: items.length,
          text: title,
          depth,
          start: pageIndex,
          end: pageCount,
        });
      }
      if (bookmark.children?.length) visit(bookmark.children, depth + 1);
    }
  }

  visit(bookmarks, 0);
  return primaryPdfiumTocItems(items, pageCount);
}

export function primaryPdfiumTocItems(items: TocItem[], pageCount: number): TocItem[] {
  const primaryDepth = Math.min(...items.map((item) => item.depth));
  if (!Number.isFinite(primaryDepth)) return [];
  const primaryItems = items.filter((item) => item.depth === primaryDepth);
  return primaryItems.map((item, index) => {
    const nextPageItem = primaryItems.slice(index + 1).find((next) => next.start > item.start);
    return {
      index,
      text: item.text,
      depth: item.depth,
      start: item.start,
      end: nextPageItem?.start ?? pageCount,
    };
  });
}

export function pdfiumBookmarkPageIndex(bookmark: PdfBookmarkObject): number | null {
  const target = bookmark.target;
  if (!target) return null;
  if (target.type === 'destination') return target.destination.pageIndex;
  if ('destination' in target.action) return target.action.destination.pageIndex;
  return null;
}

export function pdfiumTocAnnotationStats(
  tocItems: TocItem[],
  annotations: Annotation[],
  userProfile: UserProfile,
  agents: PublicAgent[],
  textDocument: PdfTextDocument | null,
) {
  const drafts = new Map<
    number,
    { count: number; colors: Set<string>; distillationCount: number }
  >();
  for (const item of tocItems) {
    drafts.set(item.index, { count: 0, colors: new Set(), distillationCount: 0 });
  }
  const ranges = textDocument ? pdfReaderBookmarkRanges(textDocument, tocItems) : [];
  for (const annotation of annotations) {
    if (!isPdfTextAnchor(annotation.anchor)) continue;
    const item = textDocument
      ? pdfiumTocItemForTextAnchor(annotation.anchor, textDocument, ranges)
      : pdfiumTocItemForPageAnchor(annotation.anchor, tocItems);
    if (!item) continue;
    const draft = drafts.get(item.index);
    if (!draft) continue;
    draft.count += 1;
    draft.colors.add(annotationColor(annotation, userProfile, agents));
    if (annotationHasPublishedDistillation(annotation)) draft.distillationCount += 1;
  }
  return new Map(
    Array.from(drafts, ([index, draft]) => [
      index,
      {
        count: draft.count,
        colors: Array.from(draft.colors),
        distillationCount: draft.distillationCount,
      },
    ]),
  );
}

export function pdfiumTocItemForTextAnchor(
  anchor: PdfTextAnchor,
  textDocument: PdfTextDocument,
  ranges: ReturnType<typeof pdfReaderBookmarkRanges>,
) {
  const page = textDocument.pages[anchor.pageIndex];
  if (!page) return null;
  const position = page.bodyStart + anchor.start;
  return ranges.find((range) => position >= range.start && position < range.end)?.item ?? null;
}

export function pdfiumTocItemForPageAnchor(anchor: PdfTextAnchor, tocItems: TocItem[]) {
  const candidates = tocItems.filter(
    (item) => anchor.pageIndex >= item.start && anchor.pageIndex < item.end,
  );
  return candidates.toSorted(
    (left, right) =>
      left.end - left.start - (right.end - right.start) ||
      right.depth - left.depth ||
      right.index - left.index,
  )[0];
}
