// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { ReadingLibrary } from '../app-reading-library';

const now = '2026-05-09T12:00:00.000Z';

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

function annotation(id: string, createdAt = now): Annotation {
  return {
    id,
    anchor: {
      exact: '正文',
      prefix: '',
      suffix: '',
      start: 0,
      end: 2,
    },
    author: 'user',
    color: '#f4c95d',
    comments: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function article(overrides: Partial<ArticleRecord> = {}): ArticleRecord {
  return {
    id: 'article_1',
    url: 'https://example.com/post',
    canonicalUrl: 'https://example.com/post',
    title: '文章',
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

function completedArticle(): ArticleRecord {
  return article({
    id: 'article_done',
    title: '完成笔记',
    annotations: [annotation('annotation_done')],
    readingDeliberation: {
      id: 'deliberation_1',
      articleId: 'article_done',
      title: '阅读审议',
      contentMarkdown: '## 审议',
      sections: [{ title: '审议', content: '内容' }],
      providerId: 'provider_1',
      providerName: 'Provider',
      modelName: 'model',
      createdAt: '2026-05-09T12:01:00.000Z',
      updatedAt: '2026-05-09T12:01:00.000Z',
    },
    readingCard: {
      id: 'card_1',
      articleId: 'article_done',
      title: '读后笔记',
      contentMarkdown: '## 核心',
      sections: [{ title: '核心', content: '内容' }],
      providerId: 'provider_1',
      providerName: 'Provider',
      modelName: 'model',
      createdAt: '2026-05-09T12:02:00.000Z',
      updatedAt: '2026-05-09T12:02:00.000Z',
      review: {
        id: 'review_1',
        articleId: 'article_done',
        readingCardId: 'card_1',
        reviewerResults: [
          {
            id: 'result_1',
            reviewerId: 'agent_1',
            reviewerNickname: '审稿人',
            reviewerUsername: 'reviewer',
            reviewerAvatar: '',
            reviewerColor: '#8a8f4f',
            verdict: 'pass',
            summary: '通过',
            findings: [],
            acceptedClaims: [],
            missingAngles: [],
            createdAt: '2026-05-09T12:03:00.000Z',
          },
        ],
        createdAt: '2026-05-09T12:03:00.000Z',
        updatedAt: '2026-05-09T12:03:00.000Z',
      },
    },
  });
}

function renderLibrary(articles: ArticleRecord[]) {
  return render(
    <ReadingLibrary
      agents={[]}
      articles={articles}
      userProfile={userProfile}
      onDeleteArticle={vi.fn()}
      onRefresh={vi.fn()}
      onSaveArticle={vi.fn()}
    />,
  );
}

describe('ReadingLibrary home', () => {
  it('derives reading status from annotations and completed reading-card rounds', () => {
    renderLibrary([
      article({ id: 'article_new', title: '新文章' }),
      article({
        id: 'article_progress',
        title: '批注文章',
        annotations: [annotation('annotation_progress')],
      }),
      completedArticle(),
    ]);

    expect(screen.getAllByText('新收录').length).toBeGreaterThan(1);
    expect(screen.getAllByText('进行中').length).toBeGreaterThan(1);
    expect(screen.getAllByText('已读完').length).toBeGreaterThan(1);
  });

  it('filters by reading status and searches source metadata', () => {
    renderLibrary([
      article({ id: 'article_new', title: '新文章', siteName: 'Acme Daily' }),
      article({
        id: 'article_progress',
        title: '批注文章',
        annotations: [annotation('annotation_progress')],
      }),
      completedArticle(),
    ]);

    fireEvent.click(screen.getByRole('button', { name: '已读完' }));
    expect(screen.getAllByText('完成笔记').length).toBeGreaterThan(0);
    expect(screen.queryByText('新文章')).toBeNull();
    expect(screen.queryByText('批注文章')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '新收录' }));
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('完成笔记')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '进行中' }));
    expect(screen.getAllByText('批注文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('完成笔记')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    fireEvent.change(screen.getByLabelText('搜索文章、作者或来源'), {
      target: { value: 'acme' },
    });
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('批注文章')).toBeNull();
  });

  it('renders the site icon next to article author', () => {
    const { container } = renderLibrary([
      article({
        siteIconUrl: 'https://favicon.im/nooneshappy.com',
        title: '站点图标文章',
      }),
    ]);

    expect(container.querySelector<HTMLImageElement>('.library-site-icon')?.src).toBe(
      'https://favicon.im/nooneshappy.com?throw-error-on-404=true',
    );
  });

  it('exposes the full title on hover and keeps an icon placeholder', () => {
    const { container } = renderLibrary([
      article({
        siteIconUrl: '',
        title: '这是一段会在卡片上被截断的很长标题',
      }),
    ]);

    expect(screen.getByTitle('这是一段会在卡片上被截断的很长标题')).toBeTruthy();
    expect(container.querySelector('.library-site-icon-slot')).toBeTruthy();
  });
});
