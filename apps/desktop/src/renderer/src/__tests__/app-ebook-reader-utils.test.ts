// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { buildTocAnnotationStats } from '@yomitomo/core';
import { readerBodyLineHeight } from '@yomitomo/reader-ui/reader-settings';
import {
  configureFoliateView,
  ebookChapterForFoliateSection,
  ebookSectionIndexForChapter,
  ebookTocItemsForReader,
  formatEbookPageLabel,
  isEbookPageNavigationReady,
  isEbookPaginationReady,
  mappedFoliateRangeRects,
  rangeForEbookAnchorInDocument,
  selectionTextForRange,
  waitForFoliatePageInfo,
  type FoliateViewElement,
  type FoliateTocItem,
} from '../source/ebook/app-ebook-reader-utils';
import { defaultTheme, inkBlackTheme } from '../theme/app-theme';

const now = '2026-05-27T00:00:00.000Z';

afterEach(() => {
  vi.unstubAllGlobals();
});

function ebookArticle(
  chapters: NonNullable<NonNullable<ArticleRecord['ebook']>['index']>['chapters'],
  format: NonNullable<ArticleRecord['ebook']>['metadata']['format'] = 'epub',
) {
  return {
    id: 'ebook-1',
    url: 'file://book.epub',
    canonicalUrl: 'file://book.epub',
    sourceType: 'ebook',
    title: '电子书',
    contentHash: 'hash-1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ebook: {
      metadata: {
        format,
        fileName: `book.${format}`,
        fileSize: 1024,
      },
      chapters: chapters.map((item) => ({
        id: item.id,
        title: item.title,
        href: item.href,
        html: '<p>正文</p>',
        textLength: item.textLength,
      })),
      index: {
        version: 1,
        articleId: 'ebook-1',
        textLength: chapters.at(-1)?.textEnd || 0,
        chapters,
        segments: [],
        paragraphs: [],
      },
    },
  } as ArticleRecord & { ebook: NonNullable<ArticleRecord['ebook']> };
}

function chapter(
  id: string,
  title: string,
  href: string,
  indexInBook: number,
  textStart: number,
  textEnd: number,
) {
  return {
    id,
    title,
    href,
    indexInBook,
    textStart,
    textEnd,
    textLength: textEnd - textStart,
    previewStart: '',
    previewEnd: '',
    segmentIds: [],
    paragraphIds: [],
  };
}

function toc(label: string, href: string, depth = 1): FoliateTocItem {
  return { label, href, depth };
}

function annotation(id: string, start: number): Annotation {
  return {
    id,
    anchor: {
      exact: id,
      prefix: '',
      suffix: '',
      start,
      end: start + id.length,
      textStartInBook: start,
      textEndInBook: start + id.length,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('ebook reader utils', () => {
  it('returns matching Foliate page info without waiting for an animation frame', async () => {
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    });
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    window.requestAnimationFrame = requestAnimationFrame;
    const pageInfo = { sectionIndex: 2, pageIndex: 3, pageCount: 8 };
    const view = {
      getPageInfo: vi.fn(() => pageInfo),
    } as unknown as FoliateViewElement;

    await expect(waitForFoliatePageInfo(view, 2)).resolves.toBe(pageInfo);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('requires complete EPUB section page counts before showing the page label', () => {
    const pageInfo = { sectionIndex: 1, pageIndex: 2, pageCount: 5 };

    expect(isEbookPageNavigationReady(pageInfo)).toBe(true);
    expect(isEbookPaginationReady(pageInfo, [null, 5, null])).toBe(false);
    expect(formatEbookPageLabel(pageInfo, [])).toBe('');
    expect(formatEbookPageLabel(pageInfo, [null, 5, null])).toBe('');
    expect(formatEbookPageLabel(pageInfo, [10, 5, 20])).toBe('13 / 35');
  });

  it('extends a title-page toc item to include the following body spine until the next toc item', () => {
    const article = ebookArticle([
      chapter('title-1', '第1章 13毫秒的秘密', 'text00007.html', 0, 0, 100),
      chapter('body-1', '第 8 章', 'text00008.html', 1, 100, 1000),
      chapter('title-2', '第2章 谁在操控股市？', 'text00009.html', 2, 1000, 1100),
      chapter('body-2', '第 10 章', 'text00010.html', 3, 1100, 2100),
    ]);

    const tocItems = ebookTocItemsForReader(
      [toc('第1章 13毫秒的秘密', 'text00007.html'), toc('第2章 谁在操控股市？', 'text00009.html')],
      article,
    );
    const stats = buildTocAnnotationStats(tocItems, [
      annotation('正文批注', 250),
      annotation('第二章批注', 1200),
    ]);

    expect(tocItems).toEqual([
      expect.objectContaining({ text: '第1章 13毫秒的秘密', start: 0, end: 1000 }),
      expect.objectContaining({ text: '第2章 谁在操控股市？', start: 1000, end: 2100 }),
    ]);
    expect(stats.get(0)?.count).toBe(1);
    expect(stats.get(1)?.count).toBe(1);
  });

  it('keeps normal toc items bounded by the next visible toc item', () => {
    const article = ebookArticle([
      chapter('preface', '序言', 'preface.html', 0, 0, 400),
      chapter('chapter-1', '第一章', 'chapter-1.html', 1, 400, 900),
      chapter('chapter-2', '第二章', 'chapter-2.html', 2, 900, 1300),
    ]);

    const tocItems = ebookTocItemsForReader(
      [
        toc('序言', 'preface.html'),
        toc('第一章', 'chapter-1.html'),
        toc('第二章', 'chapter-2.html'),
      ],
      article,
    );

    expect(tocItems.map((item) => [item.start, item.end])).toEqual([
      [0, 400],
      [400, 900],
      [900, 1300],
    ]);
  });

  it('falls back to section indexes for EPUB when Foliate section ids are not href strings', () => {
    const article = ebookArticle([
      chapter('cover', '封面', 'kindle:section:0', 0, 0, 100),
      chapter('chapter-1', '第一章', 'kindle:section:1', 1, 100, 500),
    ]);
    const view = {
      book: {
        sections: [{ id: { index: 0 } }, { id: { index: 1 } }],
      },
    } as unknown as FoliateViewElement;

    expect(ebookChapterForFoliateSection(article, view, 1)?.id).toBe('chapter-1');
    expect(ebookSectionIndexForChapter(article, view, article.ebook.index!.chapters[1])).toBe(1);
  });

  it('does not fall back to section indexes for Kindle formats', () => {
    for (const format of ['azw3', 'mobi'] as const) {
      const article = ebookArticle(
        [
          chapter('cover', '封面', 'kindle:section:0', 0, 0, 100),
          chapter('chapter-1', '第一章', 'kindle:section:1', 1, 100, 500),
        ],
        format,
      );
      const view = {
        book: {
          sections: [{ id: '0' }, { id: '1' }],
        },
      } as unknown as FoliateViewElement;

      expect(ebookChapterForFoliateSection(article, view, 1)).toBeNull();
      expect(ebookSectionIndexForChapter(article, view, article.ebook.index!.chapters[1])).toBe(-1);
    }
  });

  it('serializes cross-paragraph selections with a searchable text boundary', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<p>第一段目标。</p><p>第二段目标。</p>';
    const first = doc.querySelectorAll('p')[0].firstChild!;
    const second = doc.querySelectorAll('p')[1].firstChild!;
    const range = doc.createRange();
    range.setStart(first, 2);
    range.setEnd(second, 3);

    expect(selectionTextForRange(range)).toBe('段目标。 第二段');
  });

  it('resolves ebook anchors across foliate block boundaries', () => {
    const doc = document.implementation.createHTMLDocument('');
    doc.body.innerHTML = '<p>第一段目标。</p><p>第二段目标。</p>';
    const first = doc.querySelectorAll('p')[0].firstChild!;
    const second = doc.querySelectorAll('p')[1].firstChild!;

    const range = rangeForEbookAnchorInDocument(doc, {
      exact: '段目标。\n\n第二段',
      prefix: '第一',
      suffix: '目标',
      start: 2,
      end: 10,
    });

    expect(range?.startContainer).toBe(first);
    expect(range?.endContainer).toBe(second);
  });
});

describe('configureFoliateView', () => {
  it('keeps foliate page turns immediate', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setAttribute('animated', '');
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 18,
        contentWidth: 720,
        backgroundColor: '#f7eddc',
      },
      defaultTheme.reader,
    );

    expect(renderer.hasAttribute('animated')).toBe(false);
    expect(renderer.getAttribute('flow')).toBe('paginated');
  });

  it('applies reader font size through the ebook body', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 22,
        contentWidth: 720,
        backgroundColor: '#eef4e8',
      },
      defaultTheme.reader,
    );

    const styles = vi.mocked(renderer.setStyles).mock.calls[0]?.[0];
    expect(styles).toContain('font-size: 22px;');
    expect(styles).toContain('background: #eef4e8;');
    expect(styles).toContain('body {\n      background: #eef4e8;');
    expect(styles).toContain('font-size: inherit;');
    expect(styles).toContain(`line-height: ${readerBodyLineHeight};`);
  });

  it('keeps ebook text readable on dark reader paper', () => {
    const renderer = document.createElement('div') as unknown as HTMLElement & {
      setStyles: (styles: string | string[]) => void;
    };
    renderer.setStyles = vi.fn();

    configureFoliateView(
      { renderer } as Parameters<typeof configureFoliateView>[0],
      {
        fontSize: 18,
        contentWidth: 720,
        backgroundColor: '#242019',
      },
      inkBlackTheme.reader,
    );

    const styles = vi.mocked(renderer.setStyles).mock.calls[0]?.[0];
    expect(styles).toContain(`color: ${inkBlackTheme.reader.ink};`);
    expect(styles).toContain(`color: ${inkBlackTheme.reader.muted};`);
    expect(styles).toContain(
      `text-decoration-color: color-mix(in srgb, ${inkBlackTheme.reader.ink} 36%, transparent);`,
    );
    expect(styles).toContain('color-scheme: dark;');
    expect(styles).toContain('body {\n      background: #242019;\n      color: inherit;');
  });
});

describe('mappedFoliateRangeRects', () => {
  it('clips paginated rects to the visible foliate viewport', () => {
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'open' });
    const frame = document.createElement('iframe');
    shadow.append(frame);
    mockRect(host, new DOMRect(0, 0, 700, 600));
    mockRect(frame, new DOMRect(-700, 0, 2100, 600));

    const rects = mappedFoliateRangeRects(
      fakeRange(frame, [new DOMRect(740, 100, 100, 20), new DOMRect(1480, 100, 100, 20)]),
      new DOMRect(0, 0, 1400, 600),
    );

    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ left: 40, top: 100, width: 100, height: 20 });
  });
});

function fakeRange(frame: HTMLIFrameElement, rects: DOMRect[]): Range {
  return {
    startContainer: {
      ownerDocument: {
        defaultView: {
          frameElement: frame,
        },
      },
    },
    getClientRects: () => rects,
  } as unknown as Range;
}

function mockRect(element: Element, rect: DOMRect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  });
}
