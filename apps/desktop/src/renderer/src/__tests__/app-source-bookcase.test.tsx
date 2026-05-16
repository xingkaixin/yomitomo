// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArticleRecord, UserProfile } from '@yomitomo/shared';
import { SourceBookcase } from '../app-source-bookcase';

vi.mock('../app-source-bookcase-web', () => ({
  WebSourceBookcase: ({ article: sourceArticle }: { article: ArticleRecord }) => (
    <div data-testid="web-source-bookcase">{sourceArticle.title}</div>
  ),
}));

vi.mock('../app-source-bookcase-ebook', () => ({
  EbookBookcase: ({ article: sourceArticle }: { article: ArticleRecord }) => (
    <div data-testid="ebook-source-bookcase">{sourceArticle.title}</div>
  ),
}));

const now = '2026-05-16T12:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    sourceType: 'web',
    title: '网页文章',
    byline: '作者',
    siteName: 'Example',
    contentHtml: '<p>正文</p>',
    contentHash: 'hash_1',
    annotations: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function ebookArticle(): ArticleRecord {
  return article({
    id: 'ebook_1',
    sourceType: 'ebook',
    title: '电子书',
    ebook: {
      metadata: {
        format: 'epub',
        fileName: 'book.epub',
        fileSize: 1024,
      },
      chapters: [
        {
          id: 'chapter_1',
          title: '第一章',
          html: '<p>正文</p>',
          textLength: 2,
        },
      ],
    },
  });
}

function renderSourceBookcase(sourceArticle: ArticleRecord | null) {
  return render(
    <SourceBookcase
      agents={[]}
      annotations={sourceArticle?.annotations ?? []}
      article={sourceArticle}
      focusAnnotationId={null}
      selectedAnnotationId={null}
      userProfile={userProfile}
      onClose={vi.fn()}
      onFocusedAnnotation={vi.fn()}
      onOpenAnnotation={vi.fn()}
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={vi.fn()}
      onUpdateArticle={vi.fn()}
    />,
  );
}

describe('SourceBookcase', () => {
  it('renders the empty source state', () => {
    renderSourceBookcase(null);

    expect(screen.getByText('选择一篇文章查看原文')).toBeTruthy();
  });

  it('routes web articles to the web source reader', () => {
    renderSourceBookcase(article());

    expect(screen.getByTestId('web-source-bookcase').textContent).toBe('网页文章');
    expect(screen.queryByTestId('ebook-source-bookcase')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('routes ebook articles to the ebook source reader', () => {
    renderSourceBookcase(ebookArticle());

    expect(screen.getByTestId('ebook-source-bookcase').textContent).toBe('电子书');
    expect(screen.queryByTestId('web-source-bookcase')).toBeNull();
  });
});
