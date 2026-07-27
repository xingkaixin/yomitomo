// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord } from '@yomitomo/shared';
import { buildTocAnnotationStats } from '@yomitomo/core';
import {
  ebookChapterForFoliateSection,
  ebookSectionIndexForChapter,
  ebookTocItemsForReader,
} from '../source/ebook/ebook-content';
import type { FoliateTocItem, FoliateViewElement } from '../source/ebook/ebook-foliate-view';

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
    author: { kind: 'user', username: 'reader' },
    color: '#f4c95d',
    comments: [],
    createdAt: now,
    updatedAt: now,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ebook content', () => {
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
});
