// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

function annotationWithThoughtsAndReply(id: string): Annotation {
  const firstThought = {
    id: `${id}_thought_1`,
    author: 'user' as const,
    content: '第一条想法',
    createdAt: '2026-05-09T12:01:00.000Z',
  };

  return {
    ...annotation(id),
    comments: [
      firstThought,
      {
        id: `${id}_reply_1`,
        author: 'user' as const,
        content: '第一条回复',
        createdAt: '2026-05-09T12:02:00.000Z',
        replyTo: firstThought.id,
      },
      {
        id: `${id}_thought_2`,
        author: 'user' as const,
        content: '第二条想法',
        createdAt: '2026-05-09T12:03:00.000Z',
      },
    ],
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
      onImportPdfFile={vi.fn()}
      onImportArticleUrl={options.onImportArticleUrl || vi.fn()}
      onReadArticle={async (articleId) => articles.find((item) => item.id === articleId) || null}
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
          article({ id: 'two_discussions', annotations: [annotationWithThoughtsAndReply('d1')] }),
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
  it('keeps library controls in one header row and shows source-specific totals', () => {
    const { container } = renderLibrary([
      article({ id: 'web_1', title: '第一篇网页' }),
      article({ id: 'web_2', title: '第二篇网页' }),
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
        sourceType: 'ebook',
        title: '第一本书',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    const headerMain = container.querySelector('.library-home-header-main');

    expect(container.querySelector('.library-home-header h2')).toBeNull();
    expect(Array.from(headerMain?.children ?? []).map((item) => item.className)).toEqual([
      'library-source-tabs',
      'library-home-actions',
    ]);
    expect(screen.getByText('共 2 篇')).toBeTruthy();
    expect(screen.queryByText(/网页文章 · 共/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /电子书/ }));

    expect(screen.getByText('共 1 本')).toBeTruthy();
    expect(screen.queryByText(/电子书 · 共/)).toBeNull();
  });

  it('renders webpage articles sorted by recent added time', () => {
    renderLibrary([
      article({ id: 'older', title: '较早文章', createdAt: '2026-05-01T12:00:00.000Z' }),
      article({ id: 'newer', title: '较新文章', createdAt: '2026-05-10T12:00:00.000Z' }),
    ]);

    expect(screen.getAllByRole('heading', { level: 3 }).map((item) => item.textContent)).toEqual([
      '较新文章',
      '较早文章',
    ]);
    expect(screen.queryByLabelText('0 划线，0 想法')).toBeNull();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeTruthy();
    expect(screen.getByText('最近添加 · 降序')).toBeTruthy();
  });

  it('searches source metadata without reading status filters', () => {
    renderLibrary([
      article({ id: 'article_new', title: '新文章', siteName: 'Acme Daily' }),
      article({
        id: 'article_progress',
        title: '批注文章',
        annotations: [annotation('annotation_progress')],
      }),
      completedArticle(),
    ]);

    expect(screen.queryByRole('button', { name: '已读完' })).toBeNull();
    fireEvent.change(screen.getByLabelText('搜索文章、作者或来源'), {
      target: { value: 'acme' },
    });
    expect(screen.getAllByText('新文章').length).toBeGreaterThan(0);
    expect(screen.queryByText('批注文章')).toBeNull();
  });

  it('renders the article domain without site icons', () => {
    const { container } = renderLibrary([
      article({
        annotations: [annotationWithThoughtsAndReply('domain_note'), annotation('domain_mark')],
        canonicalUrl: 'https://nooneshappy.com/posts/1',
        siteIconUrl: 'https://favicon.im/nooneshappy.com',
        siteName: '站点名称不显示',
        title: '域名文章',
      }),
    ]);

    expect(screen.getByText('nooneshappy.com')).toBeTruthy();
    expect(screen.getByLabelText('2 划线，2 想法')).toBeTruthy();
    expect(screen.queryByText('站点名称不显示')).toBeNull();
    expect(container.querySelector('.library-site-icon')).toBeNull();
  });

  it('renders ebooks as list rows with cover progress', async () => {
    const coverUrl = 'data:image/jpeg;base64,ZmFrZS1jb3Zlcg==';
    const getArticleCover = vi.fn().mockResolvedValue(coverUrl);
    Object.defineProperty(window, 'yomitomoDesktop', {
      configurable: true,
      value: { getArticleCover },
    });
    const { container } = renderLibrary([
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
        sourceType: 'ebook',
        title: '电子书标题',
        byline: '作者名',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
        annotations: [annotationWithComments('ebook_note', 1)],
        readingProgress: {
          pageIndex: 4,
          pageCount: 10,
          progress: 0.4,
          updatedAt: now,
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /电子书/ }));

    expect(screen.queryByRole('button', { name: '书架' })).toBeNull();
    expect(screen.queryByRole('button', { name: '列表' })).toBeNull();
    expect(screen.getAllByText('作者名').length).toBeGreaterThan(1);
    expect(screen.getAllByText('电子书标题').length).toBeGreaterThan(1);
    expect(screen.getByLabelText('1 划线，1 想法')).toBeTruthy();
    expect(container.querySelector('.library-ebook-progress')).toBeTruthy();
    await waitFor(() => expect(getArticleCover).toHaveBeenCalledWith('ebook_1'));
    expect(container.querySelector('.article-book-cover-image')?.getAttribute('src')).toBe(
      coverUrl,
    );
  });

  it('renders PDFs as document rows with metadata', () => {
    renderLibrary([
      article({
        id: 'pdf_1',
        url: 'pdf:pdf_1',
        canonicalUrl: 'pdf:hash_1',
        sourceType: 'pdf',
        title: 'PDF 标题',
        byline: undefined,
        siteName: 'PDF',
        contentHtml: undefined,
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'paper.pdf',
            author: 'PDF 作者',
            fileSize: 2048,
            pageCount: 12,
          },
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));

    expect(screen.getByText('共 1 份')).toBeTruthy();
    expect(screen.getByText('PDF 作者')).toBeTruthy();
    expect(screen.queryByText('paper.pdf')).toBeNull();
    expect(screen.getByRole('button', { name: '打开PDF：PDF 标题' })).toBeTruthy();
  });

  it('exposes the full title on hover', () => {
    renderLibrary([
      article({
        siteIconUrl: '',
        title: '这是一段会在卡片上被截断的很长标题',
      }),
    ]);

    expect(screen.getByTitle('这是一段会在卡片上被截断的很长标题')).toBeTruthy();
  });

  it('opens a webpage article in the source reader', async () => {
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

    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    expect(screen.getAllByText('网页文章').length).toBeGreaterThan(0);
    expect(screen.getByText('正文')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(screen.queryByText('正文')).toBeNull();
    expect(screen.getByRole('button', { name: '打开文章：网页文章' })).toBeTruthy();
  });

  it('returns to the ebook section after reading an ebook', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    renderLibrary([
      article({ id: 'web_1', title: '网页文章' }),
      article({
        id: 'ebook_1',
        url: 'ebook://ebook_1',
        canonicalUrl: 'ebook://ebook_1',
        sourceType: 'ebook',
        title: '电子书标题',
        contentHtml: '<p>书正文</p>',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'book.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('button', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '打开电子书：电子书标题' }));
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    const sourceTabs = screen.getByRole('tablist', { name: '阅读库内容类型' });
    expect(
      within(sourceTabs)
        .getByRole('button', { name: /电子书/ })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByRole('button', { name: '打开电子书：电子书标题' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章：网页文章' })).toBeNull();
  });

  it('imports a webpage and shows duplicate article action', async () => {
    const duplicate = article({ title: '重复文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    renderLibrary([duplicate], { onImportArticleUrl });

    fireEvent.click(screen.getByRole('button', { name: '添加网页' }));
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

    fireEvent.click(screen.getByRole('button', { name: '添加网页' }));
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

    fireEvent.click(screen.getByRole('button', { name: '添加网页' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(
      (await screen.findAllByText('无法访问这个网页，请确认链接可打开后再试')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens ebook import dialog from the ebook section action', () => {
    renderLibrary([]);

    fireEvent.click(screen.getByRole('button', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('添加 ePub 电子书')).toBeTruthy();
    expect(screen.getByText('拖入 EPUB，或点击选择')).toBeTruthy();
  });
});
