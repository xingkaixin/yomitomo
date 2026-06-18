// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Annotation,
  ArticleReadingProgress,
  ArticleRecord,
  ArticleSummaryRecord,
  AppSettings,
  UserProfile,
  WeReadBook,
} from '@yomitomo/shared';
import { ReadingLibrary, groupLibraryArticles } from '../reading-library/app-reading-library';
import { initializeAppI18n } from '../i18n/app-i18n';
import { defaultTheme } from '../theme/app-theme';
import { playAppSoundEffect } from '../sound/app-sound-effects';

vi.mock('../sound/app-sound-effects', () => ({
  playAppSoundEffect: vi.fn(),
}));

const now = '2026-05-09T12:00:00.000Z';

const userProfile: UserProfile = {
  id: 'user_1',
  nickname: 'Kevin',
  username: 'kevin',
  avatar: '',
  annotationColor: '#f4c95d',
  updatedAt: now,
};

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = () => undefined;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  initializeAppI18n('zh-CN');
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

function articleSummary(record: ArticleRecord): ArticleSummaryRecord {
  const summary = { ...record };
  delete summary.contentHtml;
  delete summary.focusCoReadingPlan;
  if (summary.ebook) {
    return {
      ...summary,
      ebook: { metadata: summary.ebook.metadata },
    };
  }
  return summary;
}

function annotationWithPublishedDistillation(id: string): Annotation {
  return {
    ...annotation(id),
    distillation: {
      status: 'published',
      content: `沉淀 ${id}`,
      publishedAt: '2026-05-09T12:04:00.000Z',
    },
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
  articles: ArticleSummaryRecord[],
  options: {
    onImportArticleUrl?: (
      url: string,
      requestId?: string,
    ) => Promise<
      { status: 'canceled' } | { status: 'imported' | 'duplicate'; article: ArticleRecord }
    >;
    onCancelArticleImport?: (requestId: string) => Promise<boolean> | boolean;
    onImportEbookFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
    onImportPdfFile?: (
      file: File,
      onProgress?: (progress: number) => void,
    ) => Promise<{ status: 'imported' | 'duplicate'; article: ArticleRecord }>;
    onReadArticle?: (articleId: string) => Promise<ArticleRecord | null>;
    onDeleteArticle?: (articleId: string) => Promise<void> | void;
    onSaveArticleReadingProgress?: (
      articleId: string,
      progress: ArticleReadingProgress,
    ) => Promise<void> | void;
    onSaveSettings?: (settings: AppSettings) => Promise<void> | void;
    settings?: AppSettings;
  } = {},
) {
  return render(
    <ReadingLibrary
      agents={[]}
      articles={articles}
      readerTheme={defaultTheme.reader}
      settings={options.settings}
      userProfile={userProfile}
      onDeleteArticle={options.onDeleteArticle || vi.fn()}
      onImportEbookFile={options.onImportEbookFile || vi.fn()}
      onImportPdfFile={options.onImportPdfFile || vi.fn()}
      onImportArticleUrl={options.onImportArticleUrl || vi.fn()}
      onCancelArticleImport={options.onCancelArticleImport}
      onReadArticle={
        options.onReadArticle ||
        (async (articleId) =>
          (articles.find((item) => item.id === articleId) as ArticleRecord | undefined) || null)
      }
      onSaveArticle={vi.fn()}
      onSaveArticleReadingProgress={options.onSaveArticleReadingProgress || vi.fn()}
      onSaveSettings={options.onSaveSettings}
      onUpdateArticle={vi.fn()}
    />,
  );
}

function fileWithSize(name: string, size: number): File {
  const file = new File(['content'], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function selectImportFile(container: HTMLElement, inputId: string, file: File) {
  selectImportFiles(container, inputId, [file]);
}

function selectImportFiles(container: HTMLElement, inputId: string, files: File[]) {
  const input =
    container.querySelector<HTMLInputElement>(`#${inputId}`) ||
    document.querySelector<HTMLInputElement>(`#${inputId}`);
  expect(input).toBeTruthy();
  fireEvent.change(input!, { target: { files } });
}

function deferredImportResult() {
  let resolve!: (value: { status: 'imported'; article: ArticleRecord }) => void;
  const promise = new Promise<{ status: 'imported'; article: ArticleRecord }>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function hasScheduledDelay(setTimeoutSpy: { mock: { calls: Array<unknown[]> } }, delayMs: number) {
  return setTimeoutSpy.mock.calls.some((call) => call[1] === delayMs);
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
      { label: '2 条划线', ids: ['two_annotations'] },
      { label: '1 条划线', ids: ['one_annotation', 'also_one_annotation'] },
      { label: '暂无划线', ids: ['no_annotations'] },
    ]);

    expect(
      groupLibraryArticles(
        [
          article({
            id: 'two_distillations',
            annotations: [
              annotationWithPublishedDistillation('d1'),
              annotationWithPublishedDistillation('d2'),
            ],
          }),
          article({ id: 'no_distillations', annotations: [annotation('d3')] }),
        ],
        'discussions',
      ).map((group) => ({
        label: group.label,
        ids: group.articles.map((item) => item.id),
      })),
    ).toEqual([
      { label: '2 条沉淀', ids: ['two_distillations'] },
      { label: '暂无沉淀', ids: ['no_distillations'] },
    ]);
  });
});

describe('ReadingLibrary home', () => {
  it('defaults to the first enabled source preference', () => {
    renderLibrary(
      [
        article({ id: 'web_1', title: '网页文章' }),
        article({
          id: 'pdf_1',
          url: 'file://paper.pdf',
          canonicalUrl: 'file://paper.pdf',
          sourceType: 'pdf',
          title: 'PDF 文档',
        }),
      ],
      {
        settings: {
          libraryContentSources: [
            { id: 'pdf', enabled: true },
            { id: 'web', enabled: true },
            { id: 'ebook', enabled: true },
            { id: 'weread', enabled: false },
          ],
        },
      },
    );

    expect(
      within(screen.getByRole('tablist', { name: '阅读库内容类型' }))
        .getByRole('tab', { name: /PDF/ })
        .getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('共 1 份')).toBeTruthy();
  });

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

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));

    expect(
      container.querySelector('.library-home-body')?.getAttribute('data-source-transition'),
    ).toBe('forward');
    expect(screen.getByText('共 1 本')).toBeTruthy();
    expect(screen.queryByText(/电子书 · 共/)).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /网页文章/ }));

    expect(
      container.querySelector('.library-home-body')?.getAttribute('data-source-transition'),
    ).toBe('backward');
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
    expect(screen.queryByLabelText('0 条划线 · 0 条沉淀')).toBeNull();
    expect(screen.getByRole('tab', { name: /PDF/ })).toBeTruthy();
    expect(screen.getByText('最近添加 · 降序')).toBeTruthy();
  });

  it('loads the current local library page from the desktop pagination API', async () => {
    const serverArticle = articleSummary(article({ id: 'server_1', title: '服务端分页文章' }));
    const listLibraryArticles = vi.fn().mockResolvedValue({
      articles: [serverArticle],
      page: 1,
      pageSize: 12,
      query: '',
      source: 'web',
      sourceCounts: { web: 13, ebook: 2, pdf: 1 },
      totalCount: 13,
    });
    vi.stubGlobal('yomitomoDesktop', { listLibraryArticles });

    renderLibrary([]);

    await waitFor(() =>
      expect(listLibraryArticles).toHaveBeenCalledWith({
        source: 'web',
        query: '',
        page: 1,
        pageSize: 12,
      }),
    );
    expect((await screen.findAllByText('服务端分页文章')).length).toBeGreaterThan(0);
    expect(screen.getByText('共 13 篇')).toBeTruthy();
  });

  it('enables server pagination before changing the page size', async () => {
    const listLibraryArticles = vi.fn(
      async ({ page }: { page: number }) =>
        ({
          articles: [
            articleSummary(
              article({
                id: `server_${page}`,
                title: `服务端分页文章 ${page}`,
              }),
            ),
          ],
          page,
          pageSize: 12,
          query: '',
          source: 'web',
          sourceCounts: { web: 13, ebook: 0, pdf: 0 },
          totalCount: 13,
        }) as const,
    );
    vi.stubGlobal('yomitomoDesktop', { listLibraryArticles });

    renderLibrary([]);

    const nextPageButton = await screen.findByRole('button', { name: '下一页' });
    fireEvent.click(nextPageButton);

    await waitFor(() =>
      expect(listLibraryArticles).toHaveBeenLastCalledWith({
        source: 'web',
        query: '',
        page: 2,
        pageSize: 12,
      }),
    );
    expect((await screen.findAllByText('服务端分页文章 2')).length).toBeGreaterThan(0);
  });

  it('plays the shared delete sound after confirming a reading item delete', async () => {
    const onDeleteArticle = vi.fn().mockResolvedValue(undefined);
    renderLibrary([article({ title: '待删除文章' })], {
      onDeleteArticle,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.42,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '更多操作：待删除文章' }));
    fireEvent.click(screen.getByRole('menuitem', { name: '删除阅读材料：待删除文章' }));
    fireEvent.click(screen.getByRole('button', { name: '删除材料' }));

    await waitFor(() => expect(onDeleteArticle).toHaveBeenCalledWith('article_1'));
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.delete_item', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.42,
    });
  });

  it('restores and saves the library page size preference', async () => {
    const onSaveSettings = vi.fn();
    const articles = Array.from({ length: 20 }, (_, index) =>
      article({
        id: `article_${index + 1}`,
        title: `文章 ${index + 1}`,
        createdAt: `2026-05-09T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
      }),
    );

    renderLibrary(articles, {
      onSaveSettings,
      settings: { libraryPageSize: 18, themeId: 'ink-paper' },
    });

    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(18);

    fireEvent.click(screen.getByRole('combobox', { name: '每页显示数量' }));
    const pageSizeOption = await screen.findByRole('option', { name: '每页 24 项' });
    fireEvent.pointerDown(pageSizeOption, { pointerType: 'mouse' });
    fireEvent.click(pageSizeOption);

    expect(onSaveSettings).toHaveBeenCalledWith({
      libraryPageSize: 24,
      themeId: 'ink-paper',
    });
  });

  it('marks pagination direction when moving between library pages', () => {
    const articles = Array.from({ length: 14 }, (_, index) =>
      article({
        id: `paged_article_${index + 1}`,
        title: `分页文章 ${index + 1}`,
        createdAt: `2026-05-09T12:${String(index + 1).padStart(2, '0')}:00.000Z`,
      }),
    );
    const { container } = renderLibrary(articles);

    fireEvent.click(screen.getByRole('button', { name: '下一页' }));

    expect(
      container.querySelector('.library-source-panel')?.getAttribute('data-page-transition'),
    ).toBe('forward');

    fireEvent.click(screen.getByRole('button', { name: '上一页' }));

    expect(
      container.querySelector('.library-source-panel')?.getAttribute('data-page-transition'),
    ).toBe('backward');
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
        byline: '原始作者',
        annotations: [
          annotationWithPublishedDistillation('domain_note'),
          annotationWithPublishedDistillation('domain_mark'),
        ],
        canonicalUrl: 'https://nooneshappy.com/posts/1',
        siteIconUrl: 'https://favicon.im/nooneshappy.com',
        siteName: '站点名称不显示',
        title: '域名文章',
        readingProgress: {
          pageIndex: 4,
          pageCount: 10,
          progress: 0.4,
          updatedAt: now,
        },
      }),
    ]);

    expect(screen.getAllByText('nooneshappy.com').length).toBeGreaterThan(1);
    const stats = screen.getByLabelText('2 条划线 · 2 条沉淀');
    expect(stats).toBeTruthy();
    expect(stats.getAttribute('title')).toBeNull();
    expect(container.querySelector('.library-web-item-cover .web-cover-domain')?.textContent).toBe(
      'nooneshappy.com',
    );
    expect(container.querySelector('.library-web-item-cover .library-cover-progress')).toBeTruthy();
    expect(
      container
        .querySelector<HTMLElement>('.library-web-item-cover .library-cover-progress')
        ?.style.getPropertyValue('--ebook-progress'),
    ).toBe('40%');
    expect(screen.queryByText('站点名称不显示')).toBeNull();
    expect(screen.queryByText('原始作者')).toBeNull();
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
            originalTitle: '电子书标题（名人推荐！荣获大奖！）',
            displayTitle: '旧展示标题',
            titleCleanupVersion: 1,
          },
          chapters: [],
        },
        annotations: [annotationWithPublishedDistillation('ebook_note')],
        readingProgress: {
          pageIndex: 4,
          pageCount: 10,
          progress: 0.4,
          updatedAt: now,
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));

    expect(screen.queryByRole('button', { name: '书架' })).toBeNull();
    expect(screen.queryByRole('button', { name: '列表' })).toBeNull();
    expect(screen.getAllByText('作者名').length).toBeGreaterThan(1);
    expect(screen.getAllByText('电子书标题').length).toBeGreaterThan(1);
    expect(screen.queryByText('电子书标题（名人推荐！荣获大奖！）')).toBeNull();
    const stats = screen.getByLabelText('1 条划线 · 1 条沉淀');
    expect(stats).toBeTruthy();
    expect(stats.getAttribute('title')).toBeNull();
    expect(container.querySelector('.library-ebook-progress')).toBeTruthy();
    await waitFor(() => expect(getArticleCover).toHaveBeenCalledWith('ebook_1'));
    expect(container.querySelector('.article-book-cover-image')?.getAttribute('src')).toBe(
      coverUrl,
    );
  });

  it('cleans legacy ebook titles in the list when display title is missing', () => {
    renderLibrary([
      article({
        id: 'legacy_ebook',
        url: 'ebook://legacy_ebook',
        canonicalUrl: 'ebook://legacy_ebook',
        sourceType: 'ebook',
        title: '艾伦·图灵传——如谜的解谜者（87届奥斯卡最佳改编剧本奖《模仿游戏》原著',
        byline: '安德鲁·霍奇斯',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'turing.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));

    expect(screen.getAllByText('艾伦·图灵传——如谜的解谜者').length).toBeGreaterThan(0);
    expect(screen.queryByText(/87届奥斯卡/)).toBeNull();
  });

  it('recleans stale ebook display titles from older cleanup versions', () => {
    renderLibrary([
      article({
        id: 'stale_ebook',
        url: 'ebook://stale_ebook',
        canonicalUrl: 'ebook://stale_ebook',
        sourceType: 'ebook',
        title: '一个故事的 99种讲法【豆瓣评分9.0近500人标记',
        byline: '马特·马登',
        ebook: {
          metadata: {
            format: 'epub',
            fileName: 'story.epub',
            fileSize: 1024,
            displayTitle: '一个故事的 99种讲法【豆瓣评分9.0近500人标记',
            titleCleanupVersion: 1,
          },
          chapters: [],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));

    expect(screen.getAllByText('一个故事的99种讲法').length).toBeGreaterThan(0);
    expect(screen.queryByText(/豆瓣评分/)).toBeNull();
  });

  it('cleans real legacy ebook metadata titles with publisher suffixes', () => {
    renderLibrary([
      article({
        id: 'story_99',
        url: 'ebook://story_99',
        canonicalUrl: 'ebook://story_99',
        sourceType: 'ebook',
        title:
          '一个故事的99种讲法【豆瓣评分9.0近500人标记，中文读者翘首以盼，风靡欧美的动漫画工作坊经典教科书，呈现讲述同一个故事的99种“脑洞”】浦睿文化出品',
        byline: '马特·马登',
        ebook: {
          metadata: {
            format: 'epub',
            fileName:
              '一个故事的99种讲法【豆瓣评分9.0近500人标记，中文读者翘首以盼，风靡欧美的动漫画工作坊经典教科书，呈现讲述同一个故事的99种“脑洞”】浦睿文化出品 - 马特·马登.epub',
            fileSize: 1024,
          },
          chapters: [],
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));

    expect(screen.getAllByText('一个故事的99种讲法').length).toBeGreaterThan(0);
    expect(screen.queryByText(/浦睿文化出品/)).toBeNull();
    expect(screen.queryByText(/豆瓣评分/)).toBeNull();
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
            author: 'BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH',
            fileSize: 2048,
            pageCount: 12,
          },
        },
      }),
    ]);

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));

    expect(screen.getByText('共 1 份')).toBeTruthy();
    expect(screen.getByText('Basant Mounir; Farida Madkour et al.')).toBeTruthy();
    expect(screen.queryByText(/BASANT MOUNIR/)).toBeNull();
    expect(screen.queryByText('paper.pdf')).toBeNull();
    expect(screen.getByRole('button', { name: '打开PDF：PDF 标题' })).toBeTruthy();
  });

  it('shows the WeRead last read date instead of reading minutes in the list', async () => {
    const book: WeReadBook = {
      bookId: 'weread_1',
      title: '微信读书标题',
      author: '微信作者',
      reviewCount: 1,
      noteCount: 2,
      bookmarkCount: 0,
      readingProgress: 12,
      readingTime: 420,
      lastReadAt: Date.parse('2026-05-28T08:00:00.000Z') / 1000,
      updatedAt: now,
    };
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [book],
    };
    vi.stubGlobal('yomitomoDesktop', {
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead: vi.fn().mockResolvedValue(state),
    });

    renderLibrary([]);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /微信读书/ }).getAttribute('aria-disabled')).toBe(
        'false',
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: /微信读书/ }));

    expect(
      await screen.findByRole('button', { name: '打开微信读书笔记：微信读书标题' }),
    ).toBeTruthy();
    expect(screen.getByText('05/28')).toBeTruthy();
    expect(screen.queryByText(/阅读 7 分钟/)).toBeNull();
    expect(screen.getByLabelText('2 条划线 · 0 条沉淀')).toBeTruthy();
  });

  it('hides disabled content source tabs and does not auto-sync hidden WeRead', async () => {
    const state = {
      settings: { configured: true, openMethod: 'deeplink' as const },
      books: [],
    };
    const syncWeRead = vi.fn().mockResolvedValue(state);
    vi.stubGlobal('yomitomoDesktop', {
      getWeReadState: vi.fn().mockResolvedValue(state),
      syncWeRead,
    });

    renderLibrary([], {
      settings: {
        libraryContentSources: [
          { id: 'ebook', enabled: true },
          { id: 'web', enabled: false },
          { id: 'pdf', enabled: false },
          { id: 'weread', enabled: false },
        ],
      },
    });

    const sourceTabs = within(screen.getByRole('tablist', { name: '阅读库内容类型' }));
    expect(sourceTabs.queryByRole('tab', { name: /网页文章/ })).toBeNull();
    expect(sourceTabs.getByRole('tab', { name: /电子书/ })).toBeTruthy();
    expect(sourceTabs.queryByRole('tab', { name: /微信读书/ })).toBeNull();
    await waitFor(() => expect(syncWeRead).not.toHaveBeenCalled());
  });

  it('loads the full article before opening a PDF summary', async () => {
    const pdfSummary = articleSummary(
      article({
        id: 'pdf_1',
        url: 'pdf:pdf_1',
        canonicalUrl: 'pdf:hash_1',
        sourceType: 'pdf',
        title: 'PDF 标题',
        siteName: 'PDF',
        pdf: {
          metadata: {
            format: 'pdf',
            fileName: 'paper.pdf',
            fileSize: 1024,
            pageCount: 12,
          },
        },
      }),
    );
    const onReadArticle = vi.fn().mockResolvedValue(null);
    renderLibrary([pdfSummary], { onReadArticle });

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '打开PDF：PDF 标题' }));

    await waitFor(() => {
      expect(onReadArticle).toHaveBeenCalledWith('pdf_1');
    });
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

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：网页文章' })[0]);

    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    expect(
      document.querySelector('.library-bookcase-screen')?.getAttribute('data-route-transition'),
    ).toBe('enter-source');
    expect(screen.getAllByText('网页文章').length).toBeGreaterThan(0);
    expect(screen.getByText('正文')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    expect(
      document.querySelector('.library-bookcase-screen')?.getAttribute('data-route-transition'),
    ).toBe('enter-library');
    expect(screen.queryByText('正文')).toBeNull();
    expect(screen.getByRole('button', { name: '打开文章：网页文章' })).toBeTruthy();
  });

  it('refreshes the open article when its summary changes externally', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('yomitomoDesktop', {});
    const initialArticle = article({ title: '同步文章' });
    const updatedArticle = article({
      title: '同步文章',
      updatedAt: '2026-05-09T12:03:00.000Z',
      annotations: [
        {
          ...annotation('annotation_1'),
          comments: [
            {
              id: 'comment_1',
              author: 'ai',
              content: '助手想法',
              agentId: 'agent_1',
              agentNickname: '行开心',
              createdAt: '2026-05-09T12:03:00.000Z',
            },
          ],
          updatedAt: '2026-05-09T12:03:00.000Z',
        },
      ],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 1,
    });
    const updatedSummary = {
      ...articleSummary(updatedArticle),
      annotations: [],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 1,
    };
    const onReadArticle = vi
      .fn<(articleId: string) => Promise<ArticleRecord | null>>()
      .mockResolvedValueOnce(initialArticle)
      .mockResolvedValue(updatedArticle);
    let setArticles!: (articles: ArticleSummaryRecord[]) => void;

    function Harness() {
      const [articles, updateArticles] = React.useState([articleSummary(initialArticle)]);
      setArticles = updateArticles;
      return (
        <ReadingLibrary
          agents={[]}
          articles={articles}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
          onDeleteArticle={vi.fn()}
          onImportEbookFile={vi.fn()}
          onImportPdfFile={vi.fn()}
          onImportArticleUrl={vi.fn()}
          onReadArticle={(articleId) => onReadArticle(articleId)}
          onSaveArticle={vi.fn()}
          onSaveArticleReadingProgress={vi.fn()}
          onUpdateArticle={vi.fn()}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：同步文章' })[0]);
    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(1));

    act(() => {
      setArticles([updatedSummary]);
    });

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(2));
    expect(onReadArticle).toHaveBeenLastCalledWith('article_1');
  });

  it('refreshes the open article when an external delete removes its last thought', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('yomitomoDesktop', {});
    const initialArticle = article({
      title: '删除同步文章',
      annotations: [
        {
          ...annotation('annotation_1'),
          comments: [
            {
              id: 'comment_1',
              author: 'user',
              content: '待删除想法',
              createdAt: '2026-05-09T12:01:00.000Z',
            },
          ],
        },
      ],
      annotationCount: 1,
      commentCount: 1,
      aiCommentCount: 0,
    });
    const updatedArticle = article({
      title: '删除同步文章',
      annotations: [{ ...annotation('annotation_1'), comments: [] }],
      annotationCount: 1,
      commentCount: 0,
      aiCommentCount: 0,
    });
    const updatedSummary = {
      ...articleSummary(updatedArticle),
      annotations: [],
      annotationCount: 1,
      commentCount: 0,
      aiCommentCount: 0,
    };
    const onReadArticle = vi
      .fn<(articleId: string) => Promise<ArticleRecord | null>>()
      .mockResolvedValueOnce(initialArticle)
      .mockResolvedValue(updatedArticle);
    let setArticles!: (articles: ArticleSummaryRecord[]) => void;

    function Harness() {
      const [articles, updateArticles] = React.useState([articleSummary(initialArticle)]);
      setArticles = updateArticles;
      return (
        <ReadingLibrary
          agents={[]}
          articles={articles}
          readerTheme={defaultTheme.reader}
          userProfile={userProfile}
          onDeleteArticle={vi.fn()}
          onImportEbookFile={vi.fn()}
          onImportPdfFile={vi.fn()}
          onImportArticleUrl={vi.fn()}
          onReadArticle={(articleId) => onReadArticle(articleId)}
          onSaveArticle={vi.fn()}
          onSaveArticleReadingProgress={vi.fn()}
          onUpdateArticle={vi.fn()}
        />
      );
    }

    render(<Harness />);

    fireEvent.click(screen.getAllByRole('button', { name: '打开文章：删除同步文章' })[0]);
    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(1));

    act(() => {
      setArticles([updatedSummary]);
    });

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledTimes(2));
    expect(onReadArticle).toHaveBeenLastCalledWith('article_1');
  });

  it('plays the distillation committed sound for publish and update events', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let onCommitted:
      | ((event: {
          articleId: string;
          annotationId: string;
          transition: 'publish' | 'update' | 'unpublish';
        }) => void)
      | null = null;
    vi.stubGlobal('yomitomoDesktop', {
      onAnnotationDistillationCommitted: vi.fn((listener) => {
        onCommitted = listener;
        return vi.fn();
      }),
    });
    const fullArticle = article({
      id: 'distillation_article',
      title: '沉淀文章',
    });
    const settings = {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.55,
    };
    renderLibrary([articleSummary(fullArticle)], {
      onReadArticle: vi.fn().mockResolvedValue(fullArticle),
      settings,
    });

    await waitFor(() => expect(onCommitted).toBeTruthy());

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'publish',
      });
    });

    await waitFor(() =>
      expect(playAppSoundEffect).toHaveBeenCalledWith('reader.distillation_committed', settings),
    );

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'update',
      });
    });

    await waitFor(() =>
      expect(playAppSoundEffect).toHaveBeenCalledWith('reader.distillation_committed', settings),
    );
    expect(playAppSoundEffect).toHaveBeenCalledTimes(2);

    await act(async () => {
      onCommitted?.({
        articleId: 'distillation_article',
        annotationId: 'missing_annotation',
        transition: 'unpublish',
      });
    });

    await waitFor(() => expect(screen.getAllByText('沉淀文章').length).toBeGreaterThan(0));
    expect(playAppSoundEffect).toHaveBeenCalledTimes(2);
  });

  it('saves webpage reading progress from the reader scroll position', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const onSaveArticleReadingProgress = vi.fn();
    const requestAnimationFrame = vi
      .fn()
      .mockImplementation((callback: FrameRequestCallback) => window.setTimeout(callback, 0));
    const cancelAnimationFrame = vi
      .fn()
      .mockImplementation((handle: number) => window.clearTimeout(handle));
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    renderLibrary(
      [
        article({
          id: 'web_progress',
          title: '网页进度文章',
          contentHtml: '<p>第一段</p><p>第二段</p><p>第三段</p>',
        }),
      ],
      { onSaveArticleReadingProgress },
    );

    fireEvent.click(screen.getByRole('button', { name: '打开文章：网页进度文章' }));
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();

    const surface = document.querySelector<HTMLElement>('.reader-surface');
    expect(surface).toBeTruthy();
    Object.defineProperties(surface!, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 1500 },
      scrollTop: { configurable: true, value: 300, writable: true },
    });
    fireEvent.scroll(surface!);

    await waitFor(() => expect(onSaveArticleReadingProgress).toHaveBeenCalled());
    expect(onSaveArticleReadingProgress).toHaveBeenLastCalledWith(
      'web_progress',
      expect.objectContaining({
        pageCount: 1000,
        pageIndex: 300,
        progress: 0.3,
      }),
    );
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

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '打开电子书：电子书标题' }));
    expect(await screen.findByRole('button', { name: '返回阅读库' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '返回阅读库' }));

    const sourceTabs = screen.getByRole('tablist', { name: '阅读库内容类型' });
    expect(
      within(sourceTabs)
        .getByRole('tab', { name: /电子书/ })
        .getAttribute('aria-selected'),
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

    fireEvent.click(screen.getByRole('button', { name: '添加网页文章' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(within(screen.getByRole('dialog')).getByText('添加网页文章')).toBeTruthy();
    expect(screen.getByLabelText('网页地址').tagName).toBe('INPUT');
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith(
        'https://example.com/post',
        'article-import-1',
      );
    });
    expect((await screen.findAllByText('这篇文章已在阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(screen.getByText('已在阅读库中找到这篇文章')).toBeTruthy();
    expect(screen.getByText('无需重复导入，可以直接打开已有文章。')).toBeTruthy();
    expect(screen.getByRole('button', { name: '打开已有文章' })).toBeTruthy();
    expect(screen.getByDisplayValue('重复文章')).toBeTruthy();
    expect(playAppSoundEffect).not.toHaveBeenCalled();
  });

  it('auto closes the webpage import dialog after a successful import', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({ id: 'article_imported', title: '新导入文章' });
    const onImportArticleUrl = vi.fn().mockResolvedValue({
      status: 'imported',
      article: imported,
    });
    renderLibrary([], {
      onImportArticleUrl,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.6,
      },
    });

    fireEvent.click(screen.getByRole('button', { name: '添加网页文章' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    await waitFor(() => {
      expect(onImportArticleUrl).toHaveBeenCalledWith(
        'https://example.com/post',
        'article-import-1',
      );
    });
    expect((await screen.findAllByText('已添加到阅读库')).length).toBeGreaterThan(0);
    expect(
      screen.getByRole('progressbar', { name: '网页文章导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect(screen.getByDisplayValue('新导入文章')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开文章' })).toBeNull();
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_single', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.6,
    });
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1200)).toBe(false);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });
  });

  it('delays webpage import cancellation and ignores late results', async () => {
    const imported = article({ id: 'article_late', title: '晚到文章' });
    const deferred = deferredImportResult();
    const onImportArticleUrl = vi.fn().mockReturnValue(deferred.promise);
    const onCancelArticleImport = vi.fn();
    renderLibrary([], { onImportArticleUrl, onCancelArticleImport });

    fireEvent.click(screen.getByRole('button', { name: '添加网页文章' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/slow' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(screen.queryByRole('button', { name: '取消解析' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '取消解析' }));
    expect(onCancelArticleImport).toHaveBeenCalledWith('article-import-1');
    expect(screen.getAllByText('已取消解析').length).toBeGreaterThan(0);

    deferred.resolve({ status: 'imported', article: imported });
    await waitFor(() => {
      expect(screen.queryByDisplayValue('晚到文章')).toBeNull();
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByDisplayValue('https://example.com/slow')).toBeTruthy();
  });

  it('shows webpage import errors inside the dialog', async () => {
    const onImportArticleUrl = vi.fn().mockRejectedValue(new Error('fetch failed'));
    renderLibrary([], { onImportArticleUrl });

    fireEvent.click(screen.getByRole('button', { name: '添加网页文章' }));
    fireEvent.change(screen.getByLabelText('网页地址'), {
      target: { value: 'https://example.com/post' },
    });
    fireEvent.click(screen.getByRole('button', { name: '解析添加' }));

    expect(await screen.findByText('解析失败')).toBeTruthy();
    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.queryByText('无法访问这个网页，请确认链接可打开后再试')).toBeNull();
    expect(screen.queryByText(/fetch failed/)).toBeNull();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('opens ebook import dialog from the ebook section action', () => {
    renderLibrary([]);

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText('添加电子书')).toBeTruthy();
    expect(
      within(dialog).getByText('可批量导入 · EPUB/AZW3/MOBI · 单本最高 80MB · 最多 10 本'),
    ).toBeTruthy();
    expect(within(dialog).getByText('拖入电子书文件，或点击选择')).toBeTruthy();
  });

  it('imports an ebook file with progress feedback', async () => {
    const imported = article({
      id: 'ebook_imported',
      url: 'ebook://ebook_imported',
      canonicalUrl: 'ebook://ebook_imported',
      sourceType: 'ebook',
      title: '导入电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'book.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      onProgress?.(42);
      return { status: 'imported' as const, article: imported };
    });
    const { container } = renderLibrary([], {
      onImportEbookFile,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.7,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));
    const file = fileWithSize('book.epub', 1024);
    selectImportFile(container, 'library-ebook-file', file);

    await waitFor(() => expect(onImportEbookFile).toHaveBeenCalledWith(file, expect.any(Function)));
    expect(
      screen.getByRole('progressbar', { name: '电子书导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(screen.getByText('导入电子书')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开电子书' })).toBeNull();
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_single', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.7,
    });
  });

  it('auto closes successful ebook imports after the shorter celebration delay', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({
      id: 'ebook_autoclose',
      url: 'ebook://ebook_autoclose',
      canonicalUrl: 'ebook://ebook_autoclose',
      sourceType: 'ebook',
      title: '自动关闭电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'autoclose.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn().mockResolvedValue({
      status: 'imported' as const,
      article: imported,
    });
    const { container } = renderLibrary([], { onImportEbookFile });

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));
    selectImportFile(container, 'library-ebook-file', fileWithSize('autoclose.epub', 1024));

    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1600)).toBe(false);
  });

  it('imports multiple ebook files sequentially', async () => {
    const importedOne = article({
      id: 'ebook_imported_one',
      url: 'ebook://ebook_imported_one',
      canonicalUrl: 'ebook://ebook_imported_one',
      sourceType: 'ebook',
      title: '第一本电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'one.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const importedTwo = article({
      id: 'ebook_imported_two',
      url: 'ebook://ebook_imported_two',
      canonicalUrl: 'ebook://ebook_imported_two',
      sourceType: 'ebook',
      title: '第二本电子书',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'two.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const calls: string[] = [];
    const onImportEbookFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      calls.push(file.name);
      onProgress?.(100);
      return {
        status: 'imported' as const,
        article: file.name === 'one.epub' ? importedOne : importedTwo,
      };
    });
    const { container } = renderLibrary([], {
      onImportEbookFile,
      settings: {
        soundEffectsEnabled: true,
        soundEffectsVolume: 0.4,
      },
    });

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));
    const one = fileWithSize('one.epub', 1024);
    const two = fileWithSize('two.epub', 1024);
    selectImportFiles(container, 'library-ebook-file', [one, two]);

    await waitFor(() => expect(onImportEbookFile).toHaveBeenCalledTimes(2));
    expect(calls).toEqual(['one.epub', 'two.epub']);
    expect(screen.getByText('第一本电子书')).toBeTruthy();
    expect(screen.getByText('第二本电子书')).toBeTruthy();
    expect((await screen.findAllByText('已导入 2 个文件')).length).toBeGreaterThan(0);
    expect(playAppSoundEffect).toHaveBeenCalledWith('library.import_success_multiple', {
      soundEffectsEnabled: true,
      soundEffectsVolume: 0.4,
    });
  });

  it('opens an existing ebook from the duplicate import state', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    const duplicate = article({
      id: 'ebook_duplicate',
      url: 'ebook://ebook_duplicate',
      canonicalUrl: 'ebook://ebook_duplicate',
      sourceType: 'ebook',
      title: '已有电子书',
      contentHtml: '<p>书正文</p>',
      ebook: {
        metadata: {
          format: 'epub',
          fileName: 'duplicate.epub',
          fileSize: 1024,
        },
        chapters: [],
      },
    });
    const onImportEbookFile = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    const onReadArticle = vi.fn().mockResolvedValue(duplicate);
    const { container } = renderLibrary([articleSummary(duplicate)], {
      onImportEbookFile,
      onReadArticle,
    });

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));
    selectImportFile(container, 'library-ebook-file', fileWithSize('duplicate.epub', 1024));

    expect((await screen.findAllByText('这本电子书已在阅读库')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '打开已有电子书' }));

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledWith('ebook_duplicate'));
  });

  it('validates ebook file extension and size before importing', async () => {
    const onImportEbookFile = vi.fn();
    const { container } = renderLibrary([], { onImportEbookFile });

    fireEvent.click(screen.getByRole('tab', { name: /电子书/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加电子书' }));
    selectImportFile(container, 'library-ebook-file', fileWithSize('notes.txt', 1024));

    expect((await screen.findAllByText('请选择 EPUB、AZW3 或 MOBI 文件')).length).toBeGreaterThan(
      0,
    );
    selectImportFile(
      container,
      'library-ebook-file',
      fileWithSize('large.azw3', 80 * 1024 * 1024 + 1),
    );

    expect((await screen.findAllByText('电子书文件不能超过 80MB')).length).toBeGreaterThan(0);
    expect(onImportEbookFile).not.toHaveBeenCalled();
  });

  it('imports a PDF file with progress feedback', async () => {
    const imported = article({
      id: 'pdf_imported',
      url: 'pdf:pdf_imported',
      canonicalUrl: 'pdf:hash_imported',
      sourceType: 'pdf',
      title: '导入 PDF',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'paper.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn(async (file: File, onProgress?: (progress: number) => void) => {
      onProgress?.(64);
      return { status: 'imported' as const, article: imported };
    });
    const { container } = renderLibrary([], { onImportPdfFile });

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加 PDF' }));
    const file = fileWithSize('paper.pdf', 2048);
    selectImportFile(container, 'library-pdf-file', file);

    await waitFor(() => expect(onImportPdfFile).toHaveBeenCalledWith(file, expect.any(Function)));
    expect(
      screen.getByRole('progressbar', { name: 'PDF 导入进度' }).getAttribute('aria-valuenow'),
    ).toBe('100');
    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(screen.getByText('导入 PDF')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '打开 PDF' })).toBeNull();
  });

  it('auto closes successful PDF imports after the shorter file delay', async () => {
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout');
    const imported = article({
      id: 'pdf_autoclose',
      url: 'pdf:pdf_autoclose',
      canonicalUrl: 'pdf:hash_autoclose',
      sourceType: 'pdf',
      title: '自动关闭 PDF',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'autoclose.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn().mockResolvedValue({
      status: 'imported' as const,
      article: imported,
    });
    const { container } = renderLibrary([], { onImportPdfFile });

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加 PDF' }));
    selectImportFile(container, 'library-pdf-file', fileWithSize('autoclose.pdf', 2048));

    expect((await screen.findAllByText('已导入 1 个文件')).length).toBeGreaterThan(0);
    expect(hasScheduledDelay(setTimeoutSpy, 900)).toBe(true);
    expect(hasScheduledDelay(setTimeoutSpy, 1800)).toBe(false);
  });

  it('opens an existing PDF from the duplicate import state', async () => {
    const duplicate = article({
      id: 'pdf_duplicate',
      url: 'pdf:pdf_duplicate',
      canonicalUrl: 'pdf:hash_duplicate',
      sourceType: 'pdf',
      title: '已有 PDF',
      siteName: 'PDF',
      pdf: {
        metadata: {
          format: 'pdf',
          fileName: 'duplicate.pdf',
          fileSize: 2048,
          pageCount: 12,
        },
      },
    });
    const onImportPdfFile = vi.fn().mockResolvedValue({
      status: 'duplicate',
      article: duplicate,
    });
    const onReadArticle = vi.fn().mockResolvedValue(duplicate);
    const { container } = renderLibrary([articleSummary(duplicate)], {
      onImportPdfFile,
      onReadArticle,
    });

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加 PDF' }));
    selectImportFile(container, 'library-pdf-file', fileWithSize('duplicate.pdf', 2048));

    expect((await screen.findAllByText('这份 PDF 已在阅读库')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '打开已有 PDF' }));

    await waitFor(() => expect(onReadArticle).toHaveBeenCalledWith('pdf_duplicate'));
  });

  it('validates PDF file extension and size before importing', async () => {
    const onImportPdfFile = vi.fn();
    const { container } = renderLibrary([], { onImportPdfFile });

    fireEvent.click(screen.getByRole('tab', { name: /PDF/ }));
    fireEvent.click(screen.getByRole('button', { name: '添加 PDF' }));
    selectImportFile(container, 'library-pdf-file', fileWithSize('book.epub', 1024));

    expect((await screen.findAllByText('请选择 PDF 文件')).length).toBeGreaterThan(0);
    selectImportFile(
      container,
      'library-pdf-file',
      fileWithSize('large.pdf', 120 * 1024 * 1024 + 1),
    );

    expect((await screen.findAllByText('PDF 文件不能超过 120MB')).length).toBeGreaterThan(0);
    expect(onImportPdfFile).not.toHaveBeenCalled();
  });
});
