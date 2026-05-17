// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Annotation, ArticleRecord, UserProfile } from '@yomitomo/shared';
import { ReadingLibrary, groupLibraryArticles } from '../app-reading-library';

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
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

function annotationWithComments(id: string, count: number): Annotation {
  return {
    ...annotation(id),
    comments: Array.from({ length: count }, (_, index) => ({
      id: `${id}_comment_${index + 1}`,
      author: 'user',
      content: `讨论 ${index + 1}`,
      createdAt: `2026-05-09T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
    })),
  };
}

function completedArticle(): ArticleRecord {
  return article({
    id: 'article_done',
    title: '完成阅读',
    annotations: [annotation('annotation_done')],
    readingProgress: {
      pageIndex: 10,
      pageCount: 10,
      progress: 1,
      updatedAt: '2026-05-09T12:03:00.000Z',
    },
  });
}

function renderLibrary(
  articles: ArticleRecord[],
  options: {
    onImportArticleUrl?: (
      url: string,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
    onImportEbookFile?: (
      file: File,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
  } = {},
) {
  return render(
    <ReadingLibrary
      agents={[]}
      articles={articles}
      userProfile={userProfile}
      onDeleteArticle={vi.fn()}
      onImportEbookFile={options.onImportEbookFile || vi.fn()}
      onImportArticleUrl={options.onImportArticleUrl || vi.fn()}
      onRefresh={vi.fn()}
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={vi.fn()}
      onUpdateArticle={vi.fn()}
    />,
  );
}

describe('groupLibraryArticles', () => {
  it('groups recent reading by article update time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T12:00:00.000+08:00'));

    const olderAddedRecentRead = article({
      id: 'older_added_recent_read',
      createdAt: '2026-05-05T09:00:00.000+08:00',
      updatedAt: '2026-05-09T10:00:00.000+08:00',
    });
    const todayAddedRead = article({
      id: 'today_added_read',
      createdAt: '2026-05-09T08:00:00.000+08:00',
      updatedAt: '2026-05-09T09:00:00.000+08:00',
    });
    const olderAddedStaleRead = article({
      id: 'older_added_stale_read',
      createdAt: '2026-05-05T08:00:00.000+08:00',
      updatedAt: '2026-05-01T09:00:00.000+08:00',
    });

    expect(
      groupLibraryArticles(
        [olderAddedRecentRead, todayAddedRead, olderAddedStaleRead],
        'recentReading',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '今天', ids: ['older_added_recent_read', 'today_added_read'] },
      { label: '更早', ids: ['older_added_stale_read'] },
    ]);
  });

  it('groups count-based sorts by their selected count', () => {
    expect(
      groupLibraryArticles(
        [
          article({ id: 'two_annotations', annotations: [annotation('a1'), annotation('a2')] }),
          article({ id: 'one_annotation', annotations: [annotation('a3')] }),
          article({ id: 'also_one_annotation', annotations: [annotation('a4')] }),
          article({ id: 'no_annotations', annotations: [] }),
        ],
        'annotations',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条批注', ids: ['two_annotations'] },
      { label: '1 条批注', ids: ['one_annotation', 'also_one_annotation'] },
      { label: '暂无批注', ids: ['no_annotations'] },
    ]);

    expect(
      groupLibraryArticles(
        [
          article({ id: 'two_discussions', annotations: [annotationWithComments('d1', 2)] }),
          article({ id: 'no_discussions', annotations: [annotation('d2')] }),
        ],
        'discussions',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条讨论', ids: ['two_discussions'] },
      { label: '暂无讨论', ids: ['no_discussions'] },
    ]);
  });
});

describe('ReadingLibrary home', () => {
  it('derives reading status from annotations and reading progress', () => {
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
    expect(screen.getAllByText('完成阅读').length).toBeGreaterThan(0);
    expect(screen.queryByText('新文章')).toBeNull();
    expect(screen.queryByText('批注文章')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '新收录' }));
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('完成阅读')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '进行中' }));
    expect(screen.getAllByText('批注文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('完成阅读')).toBeNull();

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

  it('opens a webpage article in the source reader', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderLibrary([article({ title: '网页文章' })]);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：网页文章' })[0]!);

    expect(screen.getByRole('button', { name: '返回阅读库，当前文章暂无批注' })).toBeTruthy();
    expect(screen.getByText('网页文章')).toBeTruthy();
    expect(screen.getByText('正文')).toBeTruthy();
  });

  it('imports a webpage and shows duplicate article action', async () => {
    const duplicate = article({ title: '重复文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    renderLibrary([duplicate], { onImportArticleUrl });

    fireEvent.click(screen.getByRole('button', { name: '添加文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '添加网页' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('添加网页文章')).toBeTruthy();
    expect(screen.getByLabelText('网页地址').tagName).toBe('TEXTAREA');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith('https://example.com/post');
    });
    expect((await screen.findAllByText('这篇文章已在阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(screen.getByText('已在阅读库中找到这篇文章')).toBeTruthy();
    expect(screen.getByText('无需重复导入，可以直接打开已有文章。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开已有文章' })).toBeTruthy();
  });

  it('auto closes the webpage import dialog after a successful import', async () => {
    const imported = article({ id: 'article_imported', title: '新导入文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'imported',
      article: imported,
    });
    renderLibrary([], { onImportArticleUrl });

    fireEvent.click(screen.getByRole('button', { name: '添加文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '添加网页' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith('https://example.com/post');
    });
    expect((await screen.findAllByText('已添加到阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 1200 });
  });

  it('shows webpage import errors inside the dialog', async () => {
    const onImportArticleUrl = vi.fn().mockRejectedValue(new Error('fetch failed'));
    renderLibrary([], { onImportArticleUrl });

    fireEvent.click(screen.getByRole('button', { name: '添加文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '添加网页' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(
      (await screen.findAllByText('无法访问这个网页，请确认链接可打开后再试')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens ebook import dialog from the add menu', () => {
    renderLibrary([]);

    fireEvent.click(screen.getByRole('button', { name: '添加文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'ePub 电子书' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('添加 ePub 电子书')).toBeTruthy();
    expect(screen.getByText('拖入 EPUB，或点击选择')).toBeTruthy();
  });
});
