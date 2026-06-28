// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArticleSummaryRecord } from '@yomitomo/shared';
import { ArticleBook, formatPdfAuthors, formatPdfHeaderAuthors } from '../shell/app-article-book';
import { initializeAppI18n } from '../i18n/app-i18n';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PDF display metadata', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  it('shows one English author with et al. on PDF covers', () => {
    expect(formatPdfAuthors('BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL', { maxAuthors: 1 })).toBe(
      'Basant Mounir et al.',
    );
  });

  it('shows one Chinese author with 等 on PDF covers', () => {
    expect(formatPdfAuthors('张三；李四；王五', { maxAuthors: 1 })).toBe('张三 等');
  });

  it('shows several list authors before summarizing', () => {
    expect(
      formatPdfAuthors('SIRAN LI; ECE SENA ETOGLU; CARSTEN EICKHOFF; MARIA GARCIA', {
        maxAuthors: 3,
      }),
    ).toBe('Siran Li; Ece Sena Etoglu; Carsten Eickhoff et al.');
  });

  it('reduces visible list authors to fit a length budget', () => {
    expect(
      formatPdfAuthors('PENNY CHONG; HARSHAVARDHAN ABHICHANDANI; JIYUAN WANG', {
        maxAuthors: 3,
        maxLength: 42,
      }),
    ).toBe('Penny Chong et al.');
    expect(
      formatPdfAuthors('BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH', {
        maxAuthors: 3,
        maxLength: 42,
      }),
    ).toBe('Basant Mounir; Farida Madkour et al.');
  });

  it('formats PDF reader header authors with a wider budget than library lists', () => {
    const authors =
      'PENNY CHONG; HARSHAVARDHAN ABHICHANDANI; JIYUAN WANG; BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH';

    expect(formatPdfAuthors(authors, { maxAuthors: 3, maxLength: 42 })).toBe('Penny Chong et al.');
    expect(formatPdfHeaderAuthors(authors)).toBe(
      'Penny Chong; Harshavardhan Abhichandani; Jiyuan Wang et al.',
    );
  });

  it('returns an empty PDF reader header author label for blank metadata', () => {
    expect(formatPdfHeaderAuthors('   ')).toBe('');
  });
});

describe('native ebook cover ratio', () => {
  it('reads cached native cover dimensions without waiting for load', async () => {
    mockImageDimensions({ complete: true, naturalHeight: 200, naturalWidth: 300 });

    const { container } = render(React.createElement(ArticleBook, { article: ebookSummary() }));
    const book = container.querySelector('.article-book') as HTMLElement;

    await waitFor(() => expect(book.style.getPropertyValue('--book-cover-ratio')).toBe('1.5'));
  });

  it('updates native cover dimensions from the image load event', async () => {
    mockImageDimensions({ complete: false, naturalHeight: 300, naturalWidth: 180 });

    const { container } = render(React.createElement(ArticleBook, { article: ebookSummary() }));
    const book = container.querySelector('.article-book') as HTMLElement;
    const image = container.querySelector('.article-book-cover-image') as HTMLImageElement;

    expect(book.style.getPropertyValue('--book-cover-ratio')).toBe('0.72');

    fireEvent.load(image);

    await waitFor(() => expect(book.style.getPropertyValue('--book-cover-ratio')).toBe('0.6'));
  });
});

function mockImageDimensions({
  complete,
  naturalHeight,
  naturalWidth,
}: {
  complete: boolean;
  naturalHeight: number;
  naturalWidth: number;
}) {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(complete);
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(naturalWidth);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(naturalHeight);
}

function ebookSummary(): ArticleSummaryRecord {
  return {
    id: 'ebook_wide_cover',
    url: 'ebook://ebook_wide_cover',
    canonicalUrl: 'ebook://ebook_wide_cover',
    title: '宽封面电子书',
    byline: '作者',
    contentHash: 'ebook_hash',
    createdAt: '2026-06-28T00:00:00.000Z',
    updatedAt: '2026-06-28T00:00:00.000Z',
    sourceType: 'ebook',
    leadImageUrl: 'data:image/png;base64,cover',
    annotations: [],
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'wide.epub',
        fileSize: 1024,
      },
    },
  };
}
