// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TocItem } from '@yomitomo/core';
import { initializeAppI18n } from '../i18n/app-i18n';
import {
  buildPdfTextDocument,
  pdfReaderBookmarkRanges,
  pdfReaderReadingSections,
  primaryPdfiumTocItems,
} from '../source/pdfium/pdfium-text-document';

describe('pdfium text document', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a searchable PDF text document with page offsets', () => {
    const document = buildPdfTextDocument(['第一页正文', '第二页正文']);

    expect(document.text).toBe('第 1 页\n第一页正文\n\n第 2 页\n第二页正文');
    expect(document.pages).toMatchObject([
      {
        pageIndex: 0,
        pageText: '第一页正文',
        textStart: 0,
        bodyStart: 6,
        bodyEnd: 11,
      },
      {
        pageIndex: 1,
        pageText: '第二页正文',
        textStart: 13,
        bodyStart: 19,
        bodyEnd: 24,
      },
    ]);
  });

  it('uses bookmark ranges before falling back to page groups', () => {
    const document = buildPdfTextDocument(['第一章 内容', '第二章 内容']);
    const tocItems: TocItem[] = [
      { index: 0, text: '第一章', depth: 0, start: 0, end: 1 },
      { index: 1, text: '第二章', depth: 0, start: 1, end: 2 },
    ];

    expect(pdfReaderBookmarkRanges(document, tocItems)).toMatchObject([
      {
        item: tocItems[0],
        pageIndex: 0,
        localStart: 0,
        start: document.pages[0].bodyStart,
        end: document.pages[1].bodyStart,
      },
      {
        item: tocItems[1],
        pageIndex: 1,
        localStart: 0,
        start: document.pages[1].bodyStart,
        end: document.text.length,
      },
    ]);
    expect(pdfReaderReadingSections(document, tocItems, 2)).toEqual([
      {
        id: 'pdf-bookmark-1-0-0',
        title: '第一章',
        start: document.pages[0].bodyStart,
        end: document.pages[1].bodyStart,
      },
      {
        id: 'pdf-bookmark-2-0-1',
        title: '第二章',
        start: document.pages[1].bodyStart,
        end: document.text.length,
      },
    ]);
  });

  it('groups non-empty pages when bookmarks are unavailable', () => {
    const document = buildPdfTextDocument(['一', '', '三', '四', '五', '六']);

    expect(pdfReaderReadingSections(document, [], 6)).toEqual([
      {
        id: 'pdf-pages-1-5',
        title: '第 1-5 页',
        start: document.pages[0].bodyStart,
        end: document.pages[4].bodyEnd,
      },
      {
        id: 'pdf-pages-6-6',
        title: '第 6 页',
        start: document.pages[5].bodyStart,
        end: document.pages[5].bodyEnd,
      },
    ]);
  });

  it('keeps only primary depth TOC items and derives page ends', () => {
    const items: TocItem[] = [
      { index: 0, text: '章一', depth: 0, start: 0, end: 9 },
      { index: 1, text: '节一', depth: 1, start: 1, end: 9 },
      { index: 2, text: '章二', depth: 0, start: 4, end: 9 },
    ];

    expect(primaryPdfiumTocItems(items, 9)).toEqual([
      { index: 0, text: '章一', depth: 0, start: 0, end: 4 },
      { index: 1, text: '章二', depth: 0, start: 4, end: 9 },
    ]);
  });
});
